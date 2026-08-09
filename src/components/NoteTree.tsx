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
import { IconButton, deleteIcon, editIcon, folderIcon, folderOpenIcon, noteIcon } from "@/components/Icon";

const PAGE_SIZE = 20;

/** Sentinel key for the virtual "Default" folder -- every note filed
 * nowhere else lives here, so there is never a bare, un-contained note in
 * this tree (see this component's doc comment). Carries no `note_folders`
 * row of its own -- `folderOpts` maps it to `GET /notes?unfiled=true`,
 * exactly what the old real "unfiled" root list used. */
const DEFAULT_KEY = "__default__";

/** The backend already returns folders `ORDER BY lower(name)`, but that
 * only covers the initial fetch -- a freshly created folder was appended to
 * the end of the array client-side, and a rename didn't re-sort in place,
 * so the visible order drifted after any edit. Re-sorting here (locale-
 * aware, via `localeCompare` -- generally more correct than SQL's `lower()`
 * across languages) after every state update that can change a name or add
 * a row is what actually keeps it alphabetical, not just "alphabetical
 * until you touch it." */
function sortFolders(folders: NoteFolder[]): NoteFolder[] {
  return [...folders].sort((a, b) => a.name.localeCompare(b.name));
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
 * Each folder keeps its own paginated note list -- notes are paginated
 * (unlike Pages), so "Load more" is scoped to whichever folder it's
 * rendered under, not shared.
 *
 * A note's folder change (via NoteThread) is applied here by a full local
 * resync (refetch the folder list + every currently-loaded section) rather
 * than trying to surgically relocate the note client-side -- an earlier
 * version tried the surgical approach and silently dropped the note when
 * its old folder had never been expanded (so wasn't cached locally) --
 * "moving a note to Unfiled doesn't work" was a direct symptom of that.
 * The resync costs one extra round-trip per move; correctness in every
 * case is worth it here.
 *
 * Not yet factored into an embeddable local package (see this repo's
 * CLAUDE.md, "Build for reuse") -- this component talks directly to
 * `useAuth`/`useTeam`/`useNoteEvents`/`tack-server-api`, which is exactly
 * the boundary a `packages/`-style extraction (mirroring `dam-picker`)
 * would need to take as injected props/a passed-in client instead, so
 * another app's own auth/team context can drive it. Marked here rather than
 * attempted here -- that's a separate, deliberate PR. Icons (`Icon.tsx`)
 * are shared with NoteThread already, a first concrete step in that
 * direction. */
export default function NoteTree() {
  const { token } = useAuth();
  const { activeTeam } = useTeam();
  const router = useRouter();
  const { subscribe, subscribeDeleted, subscribeRefresh } = useNoteEvents();
  const t = useTranslations("navigator");
  const tNotes = useTranslations("notes");
  const params = useParams<{ noteId?: string }>();
  const selectedNoteId = params.noteId;

  const [folders, setFolders] = useState<NoteFolder[] | null>(null);
  const [foldersError, setFoldersError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // Keyed by folder id, or DEFAULT_KEY for the virtual Default folder.
  const [notesByKey, setNotesByKey] = useState<Record<string, Note[]>>({});
  const [hasMoreByKey, setHasMoreByKey] = useState<Record<string, boolean>>({});
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

  function folderOpts(key: string): { folderId?: string; unfiled?: boolean } {
    return key === DEFAULT_KEY ? { unfiled: true } : { folderId: key };
  }

  /** `offset`/`limit`/`append` fully determine the fetch -- a first load is
   * `(0, PAGE_SIZE, false)`, "Load more" is `(loaded, PAGE_SIZE, true)`, and
   * a resync re-fetches everything already loaded via
   * `(0, max(loaded, PAGE_SIZE), false)` -- see `refetchLoaded`. Kept as
   * three explicit params (not one column doing double duty as both an
   * offset and a limit) after an earlier version conflated them and
   * silently fetched page 2 (empty) on every refresh instead of refreshing
   * page 1. */
  async function fetchNotes(key: string, generation: number, offset: number, limit: number, append: boolean) {
    if (!token || !activeTeam) return;
    setLoadingKeys((prev) => new Set(prev).add(key));
    try {
      const page = await listNotes(token, activeTeam.id, { limit, offset, ...folderOpts(key) });
      if (generation !== generationRef.current) return;
      const existing = append ? (notesByKeyRef.current[key] ?? []) : [];
      notesByKeyRef.current = { ...notesByKeyRef.current, [key]: [...existing, ...page.notes] };
      setNotesByKey(notesByKeyRef.current);
      setHasMoreByKey((prev) => ({ ...prev, [key]: page.has_more }));
    } catch (e) {
      if (generation === generationRef.current) setNotesError((e as Error).message);
    } finally {
      // Unconditional (not gated on `generation === generationRef.current`):
      // a resync bumps the generation for every in-flight load, and gating
      // this left a section stuck "loading" forever after a mid-flight
      // resync, permanently hiding its "Load more".
      setLoadingKeys((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  }

  function loadMore(key: string) {
    if (loadingKeys.has(key)) return;
    fetchNotes(key, generationRef.current, notesByKeyRef.current[key]?.length ?? 0, PAGE_SIZE, true);
  }

  async function refreshFolders() {
    if (!token || !activeTeam) return;
    try {
      const f = await listNoteFolders(token, activeTeam.id);
      setFolders(sortFolders(f));
    } catch (e) {
      setFoldersError((e as Error).message);
    }
  }

  /** Re-fetches everything currently loaded under `key` (only ever true for
   * a folder -- including Default -- that's actually been expanded),
   * preserving its loaded count. */
  function refetchLoaded(key: string, generation: number) {
    const limit = Math.max(notesByKeyRef.current[key]?.length ?? 0, PAGE_SIZE);
    return fetchNotes(key, generation, 0, limit, false);
  }

  /** Full local resync: the folder list (note_count badges) plus every
   * section that's actually loaded right now. See this component's doc
   * comment for why a folder move triggers this instead of a surgical
   * client-side relocation. */
  async function resync() {
    generationRef.current += 1;
    const generation = generationRef.current;
    await refreshFolders();
    const keys = Object.keys(notesByKeyRef.current);
    await Promise.all(keys.map((key) => refetchLoaded(key, generation)));
  }

  // Only the folder list itself loads on mount/team switch -- cheap
  // metadata (names + counts), not note content. No folder's notes load
  // (including Default's) until that row is actually expanded.
  useEffect(() => {
    generationRef.current += 1;
    const generation = generationRef.current;
    notesByKeyRef.current = {};
    setNotesByKey({});
    setHasMoreByKey({});
    setLoadingKeys(new Set());
    setExpanded(new Set());
    setNotesError(null);
    setFolders(null);
    setFoldersError(null);
    if (!token || !activeTeam) return;
    listNoteFolders(token, activeTeam.id)
      .then((f) => {
        if (generation === generationRef.current) setFolders(sortFolders(f));
      })
      .catch((e) => {
        if (generation === generationRef.current) setFoldersError(e.message);
      });
  }, [token, activeTeam]);

  function toggleFolder(key: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
        if (!notesByKeyRef.current[key]) fetchNotes(key, generationRef.current, 0, PAGE_SIZE, false);
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

  async function handleCreateFolder() {
    const name = newFolderName.trim();
    if (!token || !activeTeam || !name || savingFolder) return;
    setSavingFolder(true);
    setFoldersError(null);
    try {
      const folder = await createNoteFolder(token, { team_id: activeTeam.id, name });
      setFolders((prev) => sortFolders([...(prev ?? []), folder]));
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
      const updated = await renameNoteFolder(token, folder.id, name);
      setFolders((prev) => (prev ? sortFolders(prev.map((f) => (f.id === updated.id ? updated : f))) : prev));
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
    setFolders((prev) => prev?.filter((f) => f.id !== folder.id) ?? prev);
    setExpanded((prev) => {
      const next = new Set(prev);
      next.delete(folder.id);
      return next;
    });
    const next = { ...notesByKeyRef.current };
    delete next[folder.id];
    notesByKeyRef.current = next;
    setNotesByKey(next);
    // The folder's notes fall back into Default server-side -- refetch it
    // (if it's been expanded) so they actually appear there instead of
    // just vanishing from view.
    if (notesByKeyRef.current[DEFAULT_KEY] || expanded.has(DEFAULT_KEY)) {
      refetchLoaded(DEFAULT_KEY, generationRef.current);
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
      const existing = notesByKeyRef.current[key] ?? [];
      notesByKeyRef.current = { ...notesByKeyRef.current, [key]: [note, ...existing] };
      setNotesByKey(notesByKeyRef.current);
      // Filing a new note into a real folder changes that folder's
      // note_count -- Default has no count badge to keep in sync.
      if (key !== DEFAULT_KEY) refreshFolders();
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

  /** Renders one folder's note rows plus its own "+ Add note" affordance --
   * nesting under the folder row is done by the *caller* wrapping this in
   * an indent+guide container, not by this function computing a depth-scaled
   * padding itself (see the folder-row render below for why: a folder's own
   * label, past its chevron and icon, previously ended up starting to the
   * *right* of its children's text when indentation was padding-only). */
  function renderFolderContents(key: string) {
    const notes = notesByKey[key];
    return (
      <>
        {!notes && (loadingKeys.has(key) ? <p className="text-xs text-slate-400 px-2 py-1">…</p> : null)}
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
        {loadingKeys.has(key) && notes && notes.length > 0 && (
          <p className="text-xs text-slate-400 px-2 py-1">{t("loading")}</p>
        )}
        {hasMoreByKey[key] && !loadingKeys.has(key) && (
          <button
            type="button"
            onClick={() => loadMore(key)}
            className="block px-2 py-1 text-xs font-medium text-rose-700 hover:underline"
          >
            {t("loadMore")}
          </button>
        )}
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
      <div key={id}>
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
          explicit choice made. */}
      {renderFolderRow(DEFAULT_KEY, t("defaultFolder"), null, null)}

      {!folders && !foldersError && <p className="px-2 py-1 text-xs text-slate-400">{t("loading")}</p>}
      {folders?.map((folder) => renderFolderRow(folder.id, folder.name, folder.note_count, folder))}

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
