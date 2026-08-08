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

const PAGE_SIZE = 20;

/** Sentinel key for unfiled, root-level notes -- mirrors PageTree.tsx's
 * `ROOT_KEY` for a space's root pages. Unfiled notes render at the same
 * depth as folder rows, exactly like PageTree renders root pages alongside
 * nothing else -- there is no synthetic "Unfiled" folder to click into. */
const ROOT_KEY = "";

/** A real two-level folder browser for Notes: folders as expandable
 * containers (▾/▸, hover-reveal rename/delete, same shape as PageTree's
 * page rows), each lazily loaded on first expand, with unfiled notes at
 * root depth as siblings of the folder rows. Replaces an earlier
 * filter-styled-as-a-list design (NoteFolderList + NotesList) that read as
 * "folder names mixed in with note names, clicking a folder does nothing" --
 * this is the fix, structured directly on PageTree.tsx's tree, not a
 * restyle of the filter.
 *
 * Each folder (and the root/unfiled level) keeps its own paginated note
 * list -- notes are paginated (unlike Pages), so "Load more" is scoped to
 * whichever section it's rendered under, not shared.
 *
 * Not yet factored into an embeddable local package (see this repo's
 * CLAUDE.md, "Build for reuse") -- this component talks directly to
 * `useAuth`/`useTeam`/`useNoteEvents`/`tack-server-api`, which is exactly
 * the boundary a `packages/`-style extraction (mirroring `dam-picker`)
 * would need to take as injected props/a passed-in client instead, so
 * another app's own auth/team context can drive it. Marked here rather than
 * attempted here -- that's a separate, deliberate PR, not a side effect of
 * a browser-usability fix. */
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

  // Which key (folder id, or ROOT_KEY) is currently showing the inline note
  // composer, if any -- only one at a time, mirrors PageTree's
  // `creatingUnder`.
  const [composingUnder, setComposingUnder] = useState<string | null>(null);
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
   * a refresh-in-place re-fetches everything already loaded via
   * `(0, max(loaded, PAGE_SIZE), false)`. Keeping these three explicit
   * (rather than one column doing double duty as both "how many more" and
   * "how many total") is deliberate -- an earlier version of this function
   * reused the same expression for both an offset and a limit and silently
   * fetched page 2 instead of refreshing page 1. */
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
      // Unconditional (not gated on `generation === generationRef.current`
      // like the rest of this function): a refresh tick bumps the
      // generation for every in-flight load, and if a stale one left `key`
      // stuck in `loadingKeys` forever, "Load more" for that section would
      // stay hidden (and `loadMore` would keep early-returning) until the
      // next team switch.
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

  /** Re-fetches everything currently loaded under `key` (root always;
   * a folder only once expanded), preserving its loaded count -- an
   * `offset: 0, limit: max(loaded, PAGE_SIZE)` fetch, not `append`. */
  function refetchLoaded(key: string, generation: number) {
    const limit = Math.max(notesByKeyRef.current[key]?.length ?? 0, PAGE_SIZE);
    return fetchNotes(key, generation, 0, limit, false);
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
  // through this shared pub/sub. A folder move relocates the note between
  // `notesByKey` buckets rather than just patching it in place -- the
  // entire point of this tree is that a note only ever appears under the
  // section it actually belongs to.
  useEffect(() => {
    return subscribe((noteId, patch) => {
      const next = { ...notesByKeyRef.current };
      let found: Note | null = null;
      for (const key of Object.keys(next)) {
        const idx = next[key].findIndex((n) => n.id === noteId);
        if (idx === -1) continue;
        const updated = { ...next[key][idx], ...patch };
        if ("folder_id" in patch) {
          next[key] = next[key].filter((n) => n.id !== noteId);
          found = updated;
        } else {
          next[key] = next[key].map((n) => (n.id === noteId ? updated : n));
        }
        break;
      }
      if (found) {
        const targetKey = found.folder_id ?? ROOT_KEY;
        // Only splice it into the target section if that section is already
        // loaded (root always is; a collapsed, never-expanded folder isn't)
        // -- it'll show correctly once that folder is expanded and fetched.
        if (next[targetKey]) next[targetKey] = [found, ...next[targetKey]];
      }
      notesByKeyRef.current = next;
      setNotesByKey(next);
      // A folder move changes both folders' note_count -- refetch the
      // folder list so the (N) badges don't go stale until the next
      // refresh tick (same fix NoteFolderList had, dropped in the rewrite).
      if ("folder_id" in patch) refreshFolders();
    });
  }, [subscribe]);

  useEffect(() => {
    return subscribeDeleted((noteId) => {
      const next = Object.fromEntries(
        Object.entries(notesByKeyRef.current).map(([key, notes]) => [key, notes.filter((n) => n.id !== noteId)])
      );
      notesByKeyRef.current = next;
      setNotesByKey(next);
    });
  }, [subscribeDeleted]);

  // Driven by the shared RefreshControl in the Navigator -- re-fetches every
  // currently-loaded section (root + any expanded folder) at its current
  // loaded count, so notes created elsewhere become visible without a full
  // reload. Also refetches the folder list, so note_count badges stay
  // accurate.
  useEffect(() => {
    return subscribeRefresh(async () => {
      if (!token || !activeTeam) return;
      generationRef.current += 1;
      const generation = generationRef.current;
      await refreshFolders();
      const keys = Object.keys(notesByKeyRef.current);
      await Promise.all(keys.map((key) => refetchLoaded(key, generation)));
    });
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

  async function handleCreateNote(key: string) {
    if (!token || !activeTeam || !newTitle.trim() || !newBody.trim() || creatingNote) return;
    setCreatingNote(true);
    try {
      const note = await createNote(token, {
        team_id: activeTeam.id,
        visibility: newVisibility,
        title: newTitle.trim(),
        body_markdown: newBody.trim(),
        folder_id: key === ROOT_KEY ? undefined : key,
      });
      const existing = notesByKeyRef.current[key] ?? [];
      notesByKeyRef.current = { ...notesByKeyRef.current, [key]: [note, ...existing] };
      setNotesByKey(notesByKeyRef.current);
      // Filing a new note into a folder changes that folder's note_count.
      if (key !== ROOT_KEY) refreshFolders();
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

  function renderComposer(key: string, depth: number) {
    if (composingUnder !== key) return null;
    return (
      <div className="space-y-2 py-2" style={{ paddingLeft: `${depth * 14 + 24}px`, paddingRight: "8px" }}>
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

  function renderNotes(key: string, depth: number) {
    const notes = notesByKey[key];
    if (!notes) {
      return loadingKeys.has(key) ? (
        <p className="text-xs text-slate-400" style={{ paddingLeft: `${depth * 14 + 24}px` }}>
          …
        </p>
      ) : null;
    }
    return (
      <>
        {notes.length === 0 && composingUnder !== key && (
          <p className="text-xs text-slate-400" style={{ paddingLeft: `${depth * 14 + 24}px` }}>
            {t("noNotes")}
          </p>
        )}
        {notes.map((note) => {
          const isSelected = selectedNoteId === note.id;
          return (
            <div
              key={note.id}
              className={`flex items-center gap-1 py-1 text-sm rounded ${
                isSelected ? "bg-rose-50 text-rose-700 font-medium" : "text-slate-700"
              }`}
              style={{ paddingLeft: `${depth * 14 + 10}px` }}
            >
              <span className="shrink-0 w-4" />
              <Link href={`/notes/${note.id}`} className="truncate hover:underline flex-1 min-w-0">
                {note.title || t("untitledNote")}
              </Link>
            </div>
          );
        })}
        {loadingKeys.has(key) && notes.length > 0 && (
          <p className="text-xs text-slate-400" style={{ paddingLeft: `${depth * 14 + 24}px` }}>
            {t("loading")}
          </p>
        )}
        {hasMoreByKey[key] && !loadingKeys.has(key) && (
          <button
            type="button"
            onClick={() => loadMore(key)}
            className="block text-xs font-medium text-rose-700 hover:underline py-1"
            style={{ paddingLeft: `${depth * 14 + 24}px` }}
          >
            {t("loadMore")}
          </button>
        )}
        <button
          type="button"
          onClick={() => setComposingUnder(key)}
          className="block text-xs font-medium text-rose-700 hover:underline py-1"
          style={{ paddingLeft: `${depth * 14 + 24}px` }}
        >
          + {t("newNote")}
        </button>
        {renderComposer(key, depth)}
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
                className="flex flex-1 min-w-0 items-center gap-1 text-left font-medium"
              >
                <span className="shrink-0 w-4 text-xs text-slate-400">{expanded.has(folder.id) ? "▾" : "▸"}</span>
                <span className="truncate">{folder.name}</span>
                <span className="shrink-0 text-xs text-slate-400">({folder.note_count})</span>
              </button>
              <button
                type="button"
                onClick={() => startRename(folder)}
                aria-label={t("renameFolder")}
                className="shrink-0 w-4 text-xs text-slate-300 opacity-0 group-hover:opacity-100 hover:text-slate-600"
              >
                ✎
              </button>
              <button
                type="button"
                onClick={() => setDeletingFolder(folder)}
                aria-label={t("deleteFolder")}
                className="shrink-0 w-4 text-xs text-slate-300 opacity-0 group-hover:opacity-100 hover:text-red-600"
              >
                ×
              </button>
            </div>
            {expanded.has(folder.id) && renderNotes(folder.id, 1)}
          </div>
        )
      )}

      {/* Unfiled notes: root depth, no synthetic "Unfiled" folder row --
          same shape as PageTree's root pages. Rendered before the
          create-folder affordances below (not after) so unfiled notes read
          as part of the same tree, not orphaned underneath the folder
          actions. */}
      {renderNotes(ROOT_KEY, 0)}

      {creatingFolder && (
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
      )}
      <button
        type="button"
        onClick={() => setCreatingFolder(true)}
        className="w-full text-left px-2.5 py-1 text-xs font-medium text-rose-700 hover:underline"
      >
        + {t("newFolder")}
      </button>

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
