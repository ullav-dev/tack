"use client";

import { useEffect, useRef, useState } from "react";
import { Link, useRouter } from "@/i18n/navigation";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useAuth } from "@/contexts/AuthContext";
import { useTeam } from "@/contexts/TeamContext";
import { useNoteEvents } from "@/contexts/NoteEventsContext";
import {
  createNote,
  createNoteFolder,
  deleteNoteFolder,
  listNoteFolders,
  listNotes,
  renameNoteFolder,
  type Note,
  type NoteFolder,
  type Visibility,
} from "@/lib/tack-server-api";
import MarkdownComposer from "@/components/MarkdownComposer";
import DeleteNoteFolderModal from "@/components/DeleteNoteFolderModal";
import Pager from "@/components/Pager";
import { IconButton, deleteIcon, editIcon, folderIcon, folderOpenIcon, noteIcon } from "@/components/Icon";

const PAGE_SIZE = 25;

/** Sentinel key for the virtual "Default" folder -- every note filed
 * nowhere else lives here, so there is never a bare, un-contained note in
 * this tree (see this component's doc comment). Carries no `note_folders`
 * row of its own -- `folderOpts` maps it to `GET /notes?unfiled=true`,
 * exactly what the old real "unfiled" root list used. */
const DEFAULT_KEY = "__default__";

/** The backend already returns folders `ORDER BY lower(name)`, but that
 * only covers one fetched page -- a freshly created folder needs the same
 * client-side re-sort (a create can land it on whatever page is currently
 * shown), and a rename didn't re-sort in place either. */
function sortFolders(folders: NoteFolder[]): NoteFolder[] {
  return [...folders].sort((a, b) => a.name.localeCompare(b.name));
}

function totalPages(total: number): number {
  return Math.max(1, Math.ceil(total / PAGE_SIZE));
}

/** A real two-level folder browser for Notes: folders as expandable
 * containers (▾/▸ + a folder icon, hover-reveal rename/delete, same shape
 * as PageTree's page rows), each lazily loaded on first expand.
 *
 * Every note lives inside a folder row -- there is no bare root-level note
 * list anymore. A note filed nowhere else lives in the always-present
 * virtual "Default" folder (`DEFAULT_KEY`, pinned first, no rename/delete
 * since it has no real `note_folders` row behind it) rather than sitting
 * loose at the tree's root the way an earlier version did -- that read as
 * genuinely messier (an implicit "everything else" bucket with no visible
 * home) than one more always-visible folder row. "+ Add note" follows from
 * this directly: since every note is created *into* some folder (Default
 * included), the action lives inside whichever folder row you're looking
 * at, not as a single global button that has to silently pick a target.
 * "+ Add folder" is the one tree-level (not per-folder) action, so it sits
 * at the very top, ahead of the folder list, not mixed in among per-folder
 * actions at the bottom.
 *
 * Both the folder list itself and each folder's note list are real,
 * server-paginated pages (`Pager`, `limit`/`offset`/`total`) -- not a
 * "Load more" that grows forever, and not skipped on the folder list just
 * because folder counts are usually small ("who knows the use cases... if
 * a lot it is needed" -- the standing rule for every list in this app, not
 * a case-by-case guess). A folder's own contents load only once it's
 * expanded; the folder list itself loads on mount (it's cheap metadata,
 * not note content).
 *
 * A note's folder change (via NoteThread) is applied here by a full local
 * resync (refetch the folder list + every currently-expanded folder's
 * *current page*) rather than trying to surgically relocate the note
 * client-side -- an earlier version tried the surgical approach and
 * silently dropped the note when its old folder had never been expanded
 * (so wasn't cached locally) -- "moving a note to Unfiled doesn't work" was
 * a direct symptom of that. The resync costs one extra round-trip per move;
 * correctness in every case is worth it here.
 *
 * Not yet factored into an embeddable local package (see this repo's
 * CLAUDE.md, "Build for reuse") -- this component talks directly to
 * `useAuth`/`useTeam`/`useNoteEvents`/`tack-server-api`, which is exactly
 * the boundary a `packages/`-style extraction (mirroring `dam-picker`)
 * would need to take as injected props/a passed-in client instead, so
 * another app's own auth/team context can drive it. Marked here rather than
 * attempted here -- that's a separate, deliberate PR. Icons (`Icon.tsx`)
 * and `Pager` are shared with NoteThread/PageTree/Navigator already, a
 * concrete step in that direction. */
interface Props {
  /** Set by Navigator when a search result's "view in folder" action is
   * clicked -- expands the note's folder (DEFAULT_KEY if unfiled) and
   * navigates to it, so a note found via search can be seen in its real
   * tree context instead of only in isolation. `folderId: null` means the
   * note is unfiled (lands in the virtual Default folder), same convention
   * `SearchHit.folder_id` already uses. Cleared via `onRevealed` once
   * handled -- Navigator owns the request's lifetime, not this component,
   * since the request can arrive before NoteTree is even mounted (switching
   * from the Spaces tab). */
  revealRequest?: { noteId: string; folderId: string | null } | null;
  onRevealed?: () => void;
}

export default function NoteTree({ revealRequest, onRevealed }: Props = {}) {
  const { token } = useAuth();
  const { activeTeam } = useTeam();
  const router = useRouter();
  const { subscribe, subscribeDeleted, subscribeRefresh } = useNoteEvents();
  const t = useTranslations("navigator");
  const tNotes = useTranslations("notes");
  const params = useParams<{ noteId?: string }>();
  const selectedNoteId = params.noteId;

  const [folders, setFolders] = useState<NoteFolder[] | null>(null);
  const [foldersTotal, setFoldersTotal] = useState(0);
  const [foldersPage, setFoldersPage] = useState(1);
  const [foldersError, setFoldersError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // Keyed by folder id, or DEFAULT_KEY for the virtual Default folder.
  const [notesByKey, setNotesByKey] = useState<Record<string, Note[]>>({});
  const [totalByKey, setTotalByKey] = useState<Record<string, number>>({});
  const [pageByKey, setPageByKey] = useState<Record<string, number>>({});
  const [loadingKeys, setLoadingKeys] = useState<Set<string>>(new Set());
  const [notesError, setNotesError] = useState<string | null>(null);

  const [creatingFolder, setCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [savingFolder, setSavingFolder] = useState(false);

  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [renaming, setRenaming] = useState(false);

  const [deletingFolder, setDeletingFolder] = useState<NoteFolder | null>(null);

  // Which key (a real folder id, or DEFAULT_KEY) is currently showing the
  // inline note composer, if any -- only one at a time, mirrors PageTree's
  // `creatingUnder`.
  const [composingUnder, setComposingUnder] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const [newBody, setNewBody] = useState("");
  const [newVisibility, setNewVisibility] = useState<Visibility>("private");
  const [creatingNote, setCreatingNote] = useState(false);

  const generationRef = useRef(0);
  const notesByKeyRef = useRef<Record<string, Note[]>>({});
  const pageByKeyRef = useRef<Record<string, number>>({});

  function folderOpts(key: string): { folderId?: string; unfiled?: boolean } {
    return key === DEFAULT_KEY ? { unfiled: true } : { folderId: key };
  }

  async function fetchNotes(key: string, generation: number, page: number) {
    if (!token || !activeTeam) return;
    setLoadingKeys((prev) => new Set(prev).add(key));
    try {
      const result = await listNotes(token, activeTeam.id, {
        limit: PAGE_SIZE,
        offset: (page - 1) * PAGE_SIZE,
        ...folderOpts(key),
      });
      if (generation !== generationRef.current) return;
      notesByKeyRef.current = { ...notesByKeyRef.current, [key]: result.notes };
      pageByKeyRef.current = { ...pageByKeyRef.current, [key]: page };
      setNotesByKey(notesByKeyRef.current);
      setPageByKey(pageByKeyRef.current);
      setTotalByKey((prev) => ({ ...prev, [key]: result.total }));
    } catch (e) {
      if (generation === generationRef.current) setNotesError((e as Error).message);
    } finally {
      // Unconditional (not gated on `generation === generationRef.current`):
      // a resync bumps the generation for every in-flight load, and gating
      // this left a section stuck "loading" forever after a mid-flight
      // resync.
      setLoadingKeys((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  }

  async function fetchFolders(generation: number, page: number) {
    if (!token || !activeTeam) return;
    try {
      const result = await listNoteFolders(token, activeTeam.id, { limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE });
      if (generation !== generationRef.current) return;
      setFolders(sortFolders(result.folders));
      setFoldersTotal(result.total);
      setFoldersPage(page);
    } catch (e) {
      if (generation === generationRef.current) setFoldersError((e as Error).message);
    }
  }

  /** Full local resync: the folder list (at its current page, for
   * note_count badges) plus every folder that's actually expanded right
   * now (at *its* current page). See this component's doc comment for why
   * a folder move triggers this instead of a surgical client-side
   * relocation. */
  async function resync() {
    generationRef.current += 1;
    const generation = generationRef.current;
    await fetchFolders(generation, foldersPage);
    await Promise.all(
      Array.from(expanded).map((key) => fetchNotes(key, generation, pageByKeyRef.current[key] ?? 1))
    );
  }

  // Only the folder list itself loads on mount/team switch -- cheap
  // metadata (names + counts), not note content. No folder's notes load
  // (including Default's) until that row is actually expanded.
  useEffect(() => {
    generationRef.current += 1;
    const generation = generationRef.current;
    notesByKeyRef.current = {};
    pageByKeyRef.current = {};
    setNotesByKey({});
    setTotalByKey({});
    setPageByKey({});
    setLoadingKeys(new Set());
    setExpanded(new Set());
    setNotesError(null);
    setFolders(null);
    setFoldersTotal(0);
    setFoldersPage(1);
    setFoldersError(null);
    if (!token || !activeTeam) return;
    fetchFolders(generation, 1);
  }, [token, activeTeam]);

  function toggleFolder(key: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
        if (!notesByKeyRef.current[key]) fetchNotes(key, generationRef.current, 1);
      }
      return next;
    });
  }

  // NoteThread broadcasts metadata changes (title edits, folder moves)
  // through this shared pub/sub. A title-only patch is applied in place; a
  // folder move triggers a full resync (see doc comment above).
  //
  // `subscribe` itself is a stable reference (useCallback([]) in
  // NoteEventsContext), so `token`/`activeTeam` MUST be explicit deps here,
  // not left off with an exhaustive-deps override -- without them, this
  // effect only ever runs once, at first mount, permanently registering a
  // callback whose closed-over `resync` (via `token`/`activeTeam`) is
  // whatever they were before auth/team even resolved. Every subsequent
  // folder move then silently no-ops inside `fetchNotes`'s
  // `if (!token || !activeTeam) return` guard -- "moving a note has no
  // effect until a page refresh" was this bug, exactly.
  useEffect(() => {
    return subscribe((noteId, patch) => {
      if ("folder_id" in patch) {
        resync();
        return;
      }
      const next = Object.fromEntries(
        Object.entries(notesByKeyRef.current).map(([key, notes]) => [
          key,
          notes.map((n) => (n.id === noteId ? { ...n, ...patch } : n)),
        ])
      );
      notesByKeyRef.current = next;
      setNotesByKey(next);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subscribe, token, activeTeam]);

  useEffect(() => {
    return subscribeDeleted((noteId) => {
      const next = Object.fromEntries(
        Object.entries(notesByKeyRef.current).map(([key, notes]) => [key, notes.filter((n) => n.id !== noteId)])
      );
      notesByKeyRef.current = next;
      setNotesByKey(next);
    });
  }, [subscribeDeleted]);

  // Driven by the shared RefreshControl in the Navigator.
  useEffect(() => {
    return subscribeRefresh(resync);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subscribeRefresh, token, activeTeam]);

  // Handles Navigator's "view in folder" search-result action. Runs after
  // the mount-reset effect above (declared later, same commit), so
  // `notesByKeyRef.current` has already been cleared for a fresh
  // team/token before this checks it. Doesn't try to jump to the exact
  // page containing the note -- the notes list has no "which page is note
  // X on" query, and paging manually from an expanded, correctly-scrolled
  // folder is a reasonable landing point; this at least gets the folder
  // open, on-screen, and the note itself selected/highlighted if it
  // happens to be on the loaded first page.
  useEffect(() => {
    if (!revealRequest || !token || !activeTeam) return;
    const key = revealRequest.folderId ?? DEFAULT_KEY;
    setExpanded((prev) => (prev.has(key) ? prev : new Set(prev).add(key)));
    if (!notesByKeyRef.current[key]) fetchNotes(key, generationRef.current, 1);
    router.push(`/notes/${revealRequest.noteId}`);
    document.getElementById(`note-folder-${key}`)?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    onRevealed?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revealRequest, token, activeTeam]);

  async function handleCreateFolder() {
    const name = newFolderName.trim();
    if (!token || !activeTeam || !name || savingFolder) return;
    setSavingFolder(true);
    setFoldersError(null);
    try {
      await createNoteFolder(token, { team_id: activeTeam.id, name });
      // A new folder can land anywhere alphabetically, possibly on a
      // different page than the one currently shown -- simplest correct
      // behavior is to jump back to page 1 and refetch, rather than
      // guessing whether it belongs on the current page.
      generationRef.current += 1;
      await fetchFolders(generationRef.current, 1);
      setCreatingFolder(false);
      setNewFolderName("");
    } catch (e) {
      setFoldersError((e as Error).message);
    } finally {
      setSavingFolder(false);
    }
  }

  function startRename(folder: NoteFolder) {
    setRenamingId(folder.id);
    setRenameDraft(folder.name);
  }

  async function handleRename(folder: NoteFolder) {
    const name = renameDraft.trim();
    if (renaming) return;
    // Blurring with an empty (or unchanged) draft just closes the input.
    if (!token || !name || name === folder.name) {
      setRenamingId(null);
      return;
    }
    setRenaming(true);
    setFoldersError(null);
    try {
      await renameNoteFolder(token, folder.id, name);
      // Same reasoning as create: a rename can move a folder to a
      // different page -- refetch the current page rather than patching
      // in place and hoping it's still correctly positioned.
      generationRef.current += 1;
      await fetchFolders(generationRef.current, foldersPage);
      setRenamingId(null);
    } catch (e) {
      setFoldersError((e as Error).message);
    } finally {
      setRenaming(false);
    }
  }

  async function handleDeleteFolder(folder: NoteFolder) {
    if (!token) return;
    await deleteNoteFolder(token, folder.id);
    setExpanded((prev) => {
      const next = new Set(prev);
      next.delete(folder.id);
      return next;
    });
    const next = { ...notesByKeyRef.current };
    delete next[folder.id];
    notesByKeyRef.current = next;
    setNotesByKey(next);
    generationRef.current += 1;
    const generation = generationRef.current;
    // A deleted folder can leave the current page short a row (or empty) --
    // re-clamp to the last valid page rather than assuming the current one
    // is still in range.
    const remaining = foldersTotal - 1;
    const targetPage = Math.min(foldersPage, totalPages(remaining));
    await fetchFolders(generation, targetPage);
    // The folder's notes fall back into Default server-side -- refetch it
    // (if it's been expanded) so they actually appear there instead of
    // just vanishing from view.
    if (expanded.has(DEFAULT_KEY)) {
      await fetchNotes(DEFAULT_KEY, generation, pageByKeyRef.current[DEFAULT_KEY] ?? 1);
    }
    setDeletingFolder(null);
  }

  async function handleCreateNote(key: string) {
    if (!token || !activeTeam || !newTitle.trim() || !newBody.trim() || creatingNote) return;
    setCreatingNote(true);
    try {
      const note = await createNote(token, {
        team_id: activeTeam.id,
        visibility: newVisibility,
        title: newTitle.trim(),
        body_markdown: newBody.trim(),
        folder_id: key === DEFAULT_KEY ? undefined : key,
      });
      // A new note is newest-first, so it always lands on page 1 of its
      // folder -- jump there rather than trying to splice it into whatever
      // page is currently shown.
      generationRef.current += 1;
      const generation = generationRef.current;
      await fetchNotes(key, generation, 1);
      // Filing a new note into a real folder changes that folder's
      // note_count -- Default has no count badge to keep in sync.
      if (key !== DEFAULT_KEY) await fetchFolders(generation, foldersPage);
      setComposingUnder(null);
      setNewTitle("");
      setNewBody("");
      setNewVisibility("private");
      router.push(`/notes/${note.id}`);
    } catch (e) {
      setNotesError((e as Error).message);
    } finally {
      setCreatingNote(false);
    }
  }

  function renderComposer(key: string) {
    if (composingUnder !== key) return null;
    return (
      <div className="space-y-2 px-2 py-2">
        <input
          autoFocus
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          placeholder={tNotes("titlePlaceholder")}
          disabled={creatingNote}
          className="w-full text-sm rounded border border-slate-200 px-2 py-1 focus:border-rose-400 focus:outline-none focus:ring-1 focus:ring-rose-400"
        />
        <select
          value={newVisibility}
          onChange={(e) => setNewVisibility(e.target.value as Visibility)}
          disabled={creatingNote}
          className="text-xs rounded border border-slate-200 px-1.5 py-1"
        >
          <option value="private">{tNotes("visibility.private")}</option>
          <option value="team">{tNotes("visibility.team")}</option>
          <option value="organization">{tNotes("visibility.organization")}</option>
        </select>
        <MarkdownComposer value={newBody} onChange={setNewBody} disabled={creatingNote} rows={4} />
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={() => {
              setComposingUnder(null);
              setNewTitle("");
              setNewBody("");
            }}
            className="text-xs text-slate-500 hover:text-slate-700 px-2 py-1"
          >
            {tNotes("cancel")}
          </button>
          <button
            type="button"
            onClick={() => handleCreateNote(key)}
            disabled={creatingNote || !newTitle.trim() || !newBody.trim()}
            className="text-xs bg-rose-700 hover:bg-rose-800 disabled:opacity-50 text-white px-3 py-1 rounded"
          >
            {creatingNote ? tNotes("saving") : tNotes("save")}
          </button>
        </div>
      </div>
    );
  }

  /** Renders one folder's note rows, its pager, and its own "+ Add note"
   * affordance -- nesting under the folder row is done by the *caller*
   * wrapping this in an indent+guide container, not by this function
   * computing a depth-scaled padding itself (see the folder-row render
   * below for why: a folder's own label, past its chevron and icon,
   * previously ended up starting to the *right* of its children's text
   * when indentation was padding-only). */
  function renderFolderContents(key: string) {
    const notes = notesByKey[key];
    const loading = loadingKeys.has(key);
    return (
      <>
        {!notes && (loading ? <p className="text-xs text-slate-400 px-2 py-1">…</p> : null)}
        {notes?.map((note) => {
          const isSelected = selectedNoteId === note.id;
          return (
            <Link
              key={note.id}
              href={`/notes/${note.id}`}
              className={`flex items-center gap-1.5 rounded px-2 py-1 text-sm ${
                isSelected ? "bg-rose-50 text-rose-700 font-medium" : "text-slate-700 hover:bg-slate-100"
              }`}
            >
              <span className={`shrink-0 ${isSelected ? "text-rose-400" : "text-slate-300"}`}>{noteIcon}</span>
              <span className="truncate">{note.title || t("untitledNote")}</span>
            </Link>
          );
        })}
        {notes?.length === 0 && <p className="text-xs text-slate-400 px-2 py-1">{t("noNotes")}</p>}
        {loading && notes && notes.length > 0 && <p className="text-xs text-slate-400 px-2 py-1">{t("loading")}</p>}
        <Pager
          page={pageByKey[key] ?? 1}
          totalPages={totalPages(totalByKey[key] ?? 0)}
          onChange={(page) => fetchNotes(key, generationRef.current, page)}
          disabled={loading}
        />
        {renderComposer(key)}
        {composingUnder !== key && (
          <button
            type="button"
            onClick={() => setComposingUnder(key)}
            className="block px-2 py-1 text-xs font-medium text-rose-700 hover:underline"
          >
            + {t("newNote")}
          </button>
        )}
      </>
    );
  }

  function renderFolderRow(id: string, name: string, noteCount: number | null, folder: NoteFolder | null) {
    const isExpanded = expanded.has(id);
    if (renamingId === id && folder) {
      return (
        <div key={id} className="px-2 py-1">
          <input
            autoFocus
            value={renameDraft}
            onChange={(e) => setRenameDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleRename(folder);
              if (e.key === "Escape") setRenamingId(null);
            }}
            onBlur={() => handleRename(folder)}
            disabled={renaming}
            className="w-full text-sm rounded border border-slate-200 px-1.5 py-0.5 focus:border-rose-400 focus:outline-none"
          />
        </div>
      );
    }
    return (
      <div key={id} id={`note-folder-${id}`}>
        <div className="group flex items-center gap-1 rounded px-2 py-1.5 text-sm text-slate-700 hover:bg-slate-100">
          <button
            type="button"
            onClick={() => toggleFolder(id)}
            className="flex flex-1 min-w-0 items-center gap-1.5 text-left font-medium"
          >
            <span className="shrink-0 w-3 text-xs text-slate-400">{isExpanded ? "▾" : "▸"}</span>
            <span className="shrink-0 text-slate-400">{isExpanded ? folderOpenIcon : folderIcon}</span>
            <span className="truncate">{name}</span>
            {noteCount !== null && <span className="shrink-0 text-xs text-slate-400">{noteCount}</span>}
          </button>
          {folder && (
            <>
              <IconButton title={t("renameFolder")} onClick={() => startRename(folder)}>
                <span className="opacity-0 group-hover:opacity-100">{editIcon}</span>
              </IconButton>
              <IconButton title={t("deleteFolder")} onClick={() => setDeletingFolder(folder)} danger>
                <span className="opacity-0 group-hover:opacity-100">{deleteIcon}</span>
              </IconButton>
            </>
          )}
        </div>
        {isExpanded && <div className="ml-4 border-l-2 border-slate-200 pl-2">{renderFolderContents(id)}</div>}
      </div>
    );
  }

  if (!activeTeam) return <p className="px-2 py-1 text-xs text-slate-400">{t("selectTeamFirst")}</p>;

  return (
    <div>
      {foldersError && <p className="px-2 py-1 text-xs text-red-600">{foldersError}</p>}
      {notesError && <p className="px-2 py-1 text-xs text-red-600">{notesError}</p>}

      {/* The one tree-level (not per-folder) create action -- pinned at the
          very top, ahead of the folder list, so it doesn't read as one more
          item mixed in among per-folder actions further down. */}
      {creatingFolder ? (
        <div className="px-2 py-1">
          <input
            autoFocus
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleCreateFolder();
              if (e.key === "Escape") {
                setCreatingFolder(false);
                setNewFolderName("");
              }
            }}
            onBlur={() => {
              if (!newFolderName.trim()) setCreatingFolder(false);
            }}
            disabled={savingFolder}
            placeholder={t("newFolderName")}
            className="w-full text-sm rounded border border-slate-200 px-1.5 py-0.5 focus:border-rose-400 focus:outline-none"
          />
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setCreatingFolder(true)}
          className="w-full text-left px-2.5 py-1 text-xs font-medium text-rose-700 hover:underline"
        >
          + {t("newFolder")}
        </button>
      )}

      {/* Default is always here, pinned first, before any real folders --
          every note lives in some folder, this is where one lands with no
          explicit choice made. Rendered outside the paginated folder list
          -- it isn't a real note_folders row, so it isn't part of what
          `foldersTotal`/`foldersPage` counts. */}
      {renderFolderRow(DEFAULT_KEY, t("defaultFolder"), null, null)}

      {!folders && !foldersError && <p className="px-2 py-1 text-xs text-slate-400">{t("loading")}</p>}
      {folders?.map((folder) => renderFolderRow(folder.id, folder.name, folder.note_count, folder))}
      <Pager
        page={foldersPage}
        totalPages={totalPages(foldersTotal)}
        onChange={(page) => fetchFolders(generationRef.current, page)}
      />

      {deletingFolder && (
        <DeleteNoteFolderModal
          folderName={deletingFolder.name}
          noteCount={deletingFolder.note_count}
          onConfirm={() => handleDeleteFolder(deletingFolder)}
          onCancel={() => setDeletingFolder(null)}
        />
      )}
    </div>
  );
}
