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

/** Sentinel key for unfiled, root-level notes -- mirrors PageTree.tsx's
 * `ROOT_KEY` for a space's root pages. Unfiled notes render at the same
 * depth as folder rows, exactly like PageTree renders root pages alongside
 * nothing else -- there is no synthetic "Unfiled" folder to click into. */
const ROOT_KEY = "";

/** A real two-level folder browser for Notes: folders as expandable
 * containers (▾/▸ + a folder icon, hover-reveal rename/delete, same shape
 * as PageTree's page rows), each lazily loaded on first expand, with
 * unfiled notes at root depth as siblings of the folder rows.
 *
 * Note creation is a *single* entry point ("+ New note", bottom-of-list --
 * same placement and the same understated text-link styling as "+ New
 * space"/"+ New page" elsewhere in this Navigator, not one scattered under
 * every folder, and not a bigger/differently-styled button). A new note is
 * always created unfiled and immediately opened, where NoteThread's own
 * folder selector files it if the user wants it in a folder. Every folder
 * having its own inline composer was tried first and made the tree read as
 * cluttered and inconsistent (a real complaint, not a hypothetical one) --
 * one clear place to create, one clear place to file, is a smaller surface
 * and a clearer mental model.
 *
 * Each folder (and the root/unfiled level) keeps its own paginated note
 * list -- notes are paginated (unlike Pages), so "Load more" is scoped to
 * whichever section it's rendered under, not shared.
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

  // Keyed by folder id, or ROOT_KEY for unfiled/root notes.
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

  const [composing, setComposing] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newBody, setNewBody] = useState("");
  const [newVisibility, setNewVisibility] = useState<Visibility>("private");
  const [creatingNote, setCreatingNote] = useState(false);

  const generationRef = useRef(0);
  const notesByKeyRef = useRef<Record<string, Note[]>>({});

  function folderOpts(key: string): { folderId?: string; unfiled?: boolean } {
    return key === ROOT_KEY ? { unfiled: true } : { folderId: key };
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
      setFolders(f);
    } catch (e) {
      setFoldersError((e as Error).message);
    }
  }

  /** Re-fetches everything currently loaded under `key` (root always; a
   * folder only once expanded), preserving its loaded count. */
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

  // Folders + root/unfiled notes both load eagerly on team switch, exactly
  // like PageTree eagerly loads a space's root pages -- only a folder's own
  // contents are lazy (on first expand).
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
        if (generation === generationRef.current) setFolders(f);
      })
      .catch((e) => {
        if (generation === generationRef.current) setFoldersError(e.message);
      });
    fetchNotes(ROOT_KEY, generation, 0, PAGE_SIZE, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, activeTeam]);

  function toggleFolder(folderId: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(folderId)) {
        next.delete(folderId);
      } else {
        next.add(folderId);
        if (!notesByKeyRef.current[folderId]) fetchNotes(folderId, generationRef.current, 0, PAGE_SIZE, false);
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
      setFolders((prev) => [...(prev ?? []), folder]);
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
      setFolders((prev) => prev?.map((f) => (f.id === updated.id ? updated : f)) ?? prev);
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
    // The folder's notes are now unfiled server-side -- refetch root so
    // they actually appear there instead of just vanishing from view.
    refetchLoaded(ROOT_KEY, generationRef.current);
    setDeletingFolder(null);
  }

  async function handleCreateNote() {
    if (!token || !activeTeam || !newTitle.trim() || !newBody.trim() || creatingNote) return;
    setCreatingNote(true);
    try {
      // Always created unfiled -- NoteThread's own folder selector is the
      // one place to file it, once it's open. See the doc comment above
      // for why this replaced a composer-per-folder design.
      const note = await createNote(token, {
        team_id: activeTeam.id,
        visibility: newVisibility,
        title: newTitle.trim(),
        body_markdown: newBody.trim(),
      });
      const existing = notesByKeyRef.current[ROOT_KEY] ?? [];
      notesByKeyRef.current = { ...notesByKeyRef.current, [ROOT_KEY]: [note, ...existing] };
      setNotesByKey(notesByKeyRef.current);
      setComposing(false);
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

  /** Renders one section's note rows at a flat left padding -- nesting
   * under a folder is done by the *caller* wrapping this in an indent+guide
   * container (see the folder-row render below), not by this function
   * computing a depth-scaled padding itself. An earlier version tried
   * depth-scaled padding alone and a folder's own label (past its chevron
   * and icon) ended up starting to the *right* of its children's text --
   * indentation that doesn't actually read as nesting. A visible left
   * guide (mirroring ReplyItem's `pl-4 border-l-2` thread indent) is what
   * makes "inside this folder" unambiguous at a glance. */
  function renderNotes(key: string) {
    const notes = notesByKey[key];
    if (!notes) {
      return loadingKeys.has(key) ? <p className="text-xs text-slate-400 px-2 py-1">…</p> : null;
    }
    return (
      <>
        {notes.map((note) => {
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
        {loadingKeys.has(key) && notes.length > 0 && <p className="text-xs text-slate-400 px-2 py-1">{t("loading")}</p>}
        {hasMoreByKey[key] && !loadingKeys.has(key) && (
          <button
            type="button"
            onClick={() => loadMore(key)}
            className="block px-2 py-1 text-xs font-medium text-rose-700 hover:underline"
          >
            {t("loadMore")}
          </button>
        )}
      </>
    );
  }

  if (!activeTeam) return <p className="px-2 py-1 text-xs text-slate-400">{t("selectTeamFirst")}</p>;

  return (
    <div>
      {foldersError && <p className="px-2 py-1 text-xs text-red-600">{foldersError}</p>}
      {notesError && <p className="px-2 py-1 text-xs text-red-600">{notesError}</p>}
      {!folders && !foldersError && <p className="px-2 py-1 text-xs text-slate-400">{t("loading")}</p>}

      {folders?.map((folder) =>
        renamingId === folder.id ? (
          <div key={folder.id} className="px-2 py-1">
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
        ) : (
          <div key={folder.id}>
            <div className="group flex items-center gap-1 rounded px-2 py-1.5 text-sm text-slate-700 hover:bg-slate-100">
              <button
                type="button"
                onClick={() => toggleFolder(folder.id)}
                className="flex flex-1 min-w-0 items-center gap-1.5 text-left font-medium"
              >
                <span className="shrink-0 w-3 text-xs text-slate-400">{expanded.has(folder.id) ? "▾" : "▸"}</span>
                <span className="shrink-0 text-slate-400">{expanded.has(folder.id) ? folderOpenIcon : folderIcon}</span>
                <span className="truncate">{folder.name}</span>
                <span className="shrink-0 text-xs text-slate-400">{folder.note_count}</span>
              </button>
              <IconButton title={t("renameFolder")} onClick={() => startRename(folder)}>
                <span className="opacity-0 group-hover:opacity-100">{editIcon}</span>
              </IconButton>
              <IconButton title={t("deleteFolder")} onClick={() => setDeletingFolder(folder)} danger>
                <span className="opacity-0 group-hover:opacity-100">{deleteIcon}</span>
              </IconButton>
            </div>
            {expanded.has(folder.id) && (
              <div className="ml-4 border-l-2 border-slate-200 pl-2">{renderNotes(folder.id)}</div>
            )}
          </div>
        )
      )}

      {/* Unfiled notes: root depth, no synthetic "Unfiled" folder row --
          same shape as PageTree's root pages. */}
      {renderNotes(ROOT_KEY)}

      {/* Create actions, bottom-of-list -- same placement and exact same
          understated text-link style as "+ New space"/"+ New page"
          elsewhere in this Navigator (small, no icon, no background,
          underline-on-hover only). An earlier version put "+ New note" at
          the *top*, styled as a bigger icon-and-background button -- both
          a placement and a sizing inconsistency with every other create
          action in this sidebar, which is what read as "ugly" and
          "confusing." */}
      {composing && (
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
                setComposing(false);
                setNewTitle("");
                setNewBody("");
              }}
              className="text-xs text-slate-500 hover:text-slate-700 px-2 py-1"
            >
              {tNotes("cancel")}
            </button>
            <button
              type="button"
              onClick={handleCreateNote}
              disabled={creatingNote || !newTitle.trim() || !newBody.trim()}
              className="text-xs bg-rose-700 hover:bg-rose-800 disabled:opacity-50 text-white px-3 py-1 rounded"
            >
              {creatingNote ? tNotes("saving") : tNotes("save")}
            </button>
          </div>
        </div>
      )}
      {!composing && (
        <button
          type="button"
          onClick={() => setComposing(true)}
          className="w-full text-left px-2.5 py-1 text-xs font-medium text-rose-700 hover:underline"
        >
          + {t("newNote")}
        </button>
      )}

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
