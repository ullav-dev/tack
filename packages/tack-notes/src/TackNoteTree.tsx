"use client";

import { useEffect, useRef, useState, type ComponentType } from "react";
import { useNoteEvents } from "./NoteEventsContext";
import type { Note, NoteFolder, TackNotesApi, Visibility } from "./api";
import MarkdownComposer from "./MarkdownComposer";
import DeleteNoteFolderModal from "./DeleteNoteFolderModal";
import Pager from "./Pager";
import { IconButton, deleteIcon, editIcon, folderIcon, folderOpenIcon, noteIcon } from "./Icon";
import type { TFunction } from "./types";

const PAGE_SIZE = 25;

/** Sentinel key for the virtual "Default" folder -- every note filed
 * nowhere else lives here, so there is never a bare, un-contained note in
 * this tree. */
const DEFAULT_KEY = "__default__";

function sortFolders(folders: NoteFolder[]): NoteFolder[] {
  return [...folders].sort((a, b) => a.name.localeCompare(b.name));
}

function totalPages(total: number): number {
  return Math.max(1, Math.ceil(total / PAGE_SIZE));
}

export interface TackNoteTreeProps {
  api: TackNotesApi;
  /** The active scope to browse notes/folders within -- whatever a host
   * app's own team/workspace switcher currently has selected. `null` shows
   * a "select a team first" message instead of fetching anything. */
  teamId: string | null;
  /** The currently-selected note's id, if the host app's own routing has
   * one open (drives the "selected" highlight on a note row) -- e.g. a
   * Next.js app would pass its own route param here. */
  selectedNoteId?: string;
  /** Builds the href for a note row's link -- the host app's own route
   * shape (e.g. `/notes/:id` here in tack, something else entirely
   * elsewhere). */
  buildNoteHref: (noteId: string) => string;
  /** Imperative navigation after creating a note or handling a
   * `revealRequest` -- not every host app uses the same router. */
  onNavigate: (noteId: string) => void;
  /** Defaults to a plain `<a>`. Pass e.g. Next's `Link` (or an
   * `next-intl`-wrapped one) for client-side navigation. */
  LinkComponent?: ComponentType<{ href: string; className?: string; children: React.ReactNode }>;
  /** Calls `t("navigator")` namespace keys. */
  t: TFunction;
  /** Calls `t("notes")` namespace keys (title placeholder, visibility
   * options, save/cancel -- shared with the inline note composer). */
  tNotes: TFunction;
  ImagePicker?: ComponentType<{ onSelect: (asset: { url: string; name: string }) => void; onClose: () => void }>;
  /** Set by a host app's search UI when a search result's "view in folder"
   * action is clicked -- expands the note's folder (DEFAULT_KEY if
   * unfiled) and navigates to it. `folderId: null` means the note is
   * unfiled. Cleared via `onRevealed` once handled. */
  revealRequest?: { noteId: string; folderId: string | null } | null;
  onRevealed?: () => void;
}

const DefaultAnchor: ComponentType<{ href: string; className?: string; children: React.ReactNode }> = ({ href, className, children }) => (
  <a href={href} className={className}>
    {children}
  </a>
);

/** A real two-level folder browser for Notes -- extracted from `tack`'s own
 * `NoteTree.tsx` (see that file's original doc comment, preserved in git
 * history, for the full design rationale: the always-present virtual
 * Default folder, server-side pagination throughout, the full-resync
 * strategy on a folder move). Every tack-specific dependency (auth, the
 * active team, routing, next-intl, the API base) is now a prop -- this is
 * the deferred "packages/-style extraction" the original file's doc
 * comment named as future work. */
export default function TackNoteTree({
  api,
  teamId,
  selectedNoteId,
  buildNoteHref,
  onNavigate,
  LinkComponent,
  t,
  tNotes,
  ImagePicker,
  revealRequest,
  onRevealed,
}: TackNoteTreeProps) {
  const Link = LinkComponent ?? DefaultAnchor;
  const { subscribe, subscribeDeleted, subscribeRefresh } = useNoteEvents();

  const [folders, setFolders] = useState<NoteFolder[] | null>(null);
  const [foldersTotal, setFoldersTotal] = useState(0);
  const [foldersPage, setFoldersPage] = useState(1);
  const [foldersError, setFoldersError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

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
    if (!teamId) return;
    setLoadingKeys((prev) => new Set(prev).add(key));
    try {
      const result = await api.listNotes(teamId, {
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
      setLoadingKeys((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  }

  async function fetchFolders(generation: number, page: number) {
    if (!teamId) return;
    try {
      const result = await api.listNoteFolders(teamId, { limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE });
      if (generation !== generationRef.current) return;
      setFolders(sortFolders(result.folders));
      setFoldersTotal(result.total);
      setFoldersPage(page);
    } catch (e) {
      if (generation === generationRef.current) setFoldersError((e as Error).message);
    }
  }

  async function resync() {
    generationRef.current += 1;
    const generation = generationRef.current;
    await fetchFolders(generation, foldersPage);
    await Promise.all(Array.from(expanded).map((key) => fetchNotes(key, generation, pageByKeyRef.current[key] ?? 1)));
  }

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
    if (!teamId) return;
    fetchFolders(generation, 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamId]);

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

  useEffect(() => {
    return subscribe((noteId, patch) => {
      if ("folder_id" in patch) {
        resync();
        return;
      }
      const next = Object.fromEntries(
        Object.entries(notesByKeyRef.current).map(([key, notes]) => [key, notes.map((n) => (n.id === noteId ? { ...n, ...patch } : n))])
      );
      notesByKeyRef.current = next;
      setNotesByKey(next);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subscribe, teamId]);

  useEffect(() => {
    return subscribeDeleted((noteId) => {
      const next = Object.fromEntries(Object.entries(notesByKeyRef.current).map(([key, notes]) => [key, notes.filter((n) => n.id !== noteId)]));
      notesByKeyRef.current = next;
      setNotesByKey(next);
    });
  }, [subscribeDeleted]);

  useEffect(() => {
    return subscribeRefresh(resync);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subscribeRefresh, teamId]);

  useEffect(() => {
    if (!revealRequest || !teamId) return;
    const key = revealRequest.folderId ?? DEFAULT_KEY;
    setExpanded((prev) => (prev.has(key) ? prev : new Set(prev).add(key)));
    if (!notesByKeyRef.current[key]) fetchNotes(key, generationRef.current, 1);
    onNavigate(revealRequest.noteId);
    document.getElementById(`note-folder-${key}`)?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    onRevealed?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revealRequest, teamId]);

  async function handleCreateFolder() {
    const name = newFolderName.trim();
    if (!teamId || !name || savingFolder) return;
    setSavingFolder(true);
    setFoldersError(null);
    try {
      await api.createNoteFolder({ team_id: teamId, name });
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
    if (!name || name === folder.name) {
      setRenamingId(null);
      return;
    }
    setRenaming(true);
    setFoldersError(null);
    try {
      await api.renameNoteFolder(folder.id, name);
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
    await api.deleteNoteFolder(folder.id);
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
    const remaining = foldersTotal - 1;
    const targetPage = Math.min(foldersPage, totalPages(remaining));
    await fetchFolders(generation, targetPage);
    if (expanded.has(DEFAULT_KEY)) {
      await fetchNotes(DEFAULT_KEY, generation, pageByKeyRef.current[DEFAULT_KEY] ?? 1);
    }
    setDeletingFolder(null);
  }

  async function handleCreateNote(key: string) {
    if (!teamId || !newTitle.trim() || !newBody.trim() || creatingNote) return;
    setCreatingNote(true);
    try {
      const note = await api.createNote({
        team_id: teamId,
        visibility: newVisibility,
        title: newTitle.trim(),
        body_markdown: newBody.trim(),
        folder_id: key === DEFAULT_KEY ? undefined : key,
      });
      generationRef.current += 1;
      const generation = generationRef.current;
      await fetchNotes(key, generation, 1);
      if (key !== DEFAULT_KEY) await fetchFolders(generation, foldersPage);
      setComposingUnder(null);
      setNewTitle("");
      setNewBody("");
      setNewVisibility("private");
      onNavigate(note.id);
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
          className="box-border w-full text-sm rounded border border-slate-200 px-2 py-1 focus:border-[var(--tnotes-400,#fb7185)] focus:outline-none focus:ring-1 focus:ring-[var(--tnotes-400,#fb7185)]"
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
        <MarkdownComposer value={newBody} onChange={setNewBody} disabled={creatingNote} rows={4} t={tNotes} ImagePicker={ImagePicker} />
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
            className="text-xs bg-[var(--tnotes-700,#be123c)] hover:bg-[var(--tnotes-800,#9f1239)] disabled:opacity-50 text-white px-3 py-1 rounded"
          >
            {creatingNote ? tNotes("saving") : tNotes("save")}
          </button>
        </div>
      </div>
    );
  }

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
              href={buildNoteHref(note.id)}
              className={`flex items-center gap-1.5 rounded px-2 py-1 text-sm ${
                isSelected ? "bg-[var(--tnotes-50,#fff1f2)] text-[var(--tnotes-700,#be123c)] font-medium" : "text-slate-700 hover:bg-slate-100"
              }`}
            >
              <span className={`shrink-0 ${isSelected ? "text-[var(--tnotes-400,#fb7185)]" : "text-slate-300"}`}>{noteIcon}</span>
              <span className="truncate">{note.title || t("untitledNote")}</span>
            </Link>
          );
        })}
        {notes?.length === 0 && <p className="text-xs text-slate-400 px-2 py-1">{t("noNotes")}</p>}
        {loading && notes && notes.length > 0 && <p className="text-xs text-slate-400 px-2 py-1">{t("loading")}</p>}
        <Pager page={pageByKey[key] ?? 1} totalPages={totalPages(totalByKey[key] ?? 0)} onChange={(page) => fetchNotes(key, generationRef.current, page)} disabled={loading} t={t} />
        {renderComposer(key)}
        {composingUnder !== key && (
          <button type="button" onClick={() => setComposingUnder(key)} className="block px-2 py-1 text-xs font-medium text-[var(--tnotes-700,#be123c)] hover:underline">
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
            className="box-border w-full text-sm rounded border border-slate-200 px-1.5 py-0.5 focus:border-[var(--tnotes-400,#fb7185)] focus:outline-none"
          />
        </div>
      );
    }
    return (
      <div key={id} id={`note-folder-${id}`}>
        <div className="group flex items-center gap-1 rounded px-2 py-1.5 text-sm text-slate-700 hover:bg-slate-100">
          <button type="button" onClick={() => toggleFolder(id)} className="flex flex-1 min-w-0 items-center gap-1.5 text-left font-medium">
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

  if (!teamId) return <p className="px-2 py-1 text-xs text-slate-400">{t("selectTeamFirst")}</p>;

  return (
    <div>
      {foldersError && <p className="px-2 py-1 text-xs text-red-600">{foldersError}</p>}
      {notesError && <p className="px-2 py-1 text-xs text-red-600">{notesError}</p>}

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
            className="box-border w-full text-sm rounded border border-slate-200 px-1.5 py-0.5 focus:border-[var(--tnotes-400,#fb7185)] focus:outline-none"
          />
        </div>
      ) : (
        <button type="button" onClick={() => setCreatingFolder(true)} className="box-border w-full text-left px-2.5 py-1 text-xs font-medium text-[var(--tnotes-700,#be123c)] hover:underline">
          + {t("newFolder")}
        </button>
      )}

      {renderFolderRow(DEFAULT_KEY, t("defaultFolder"), null, null)}

      {!folders && !foldersError && <p className="px-2 py-1 text-xs text-slate-400">{t("loading")}</p>}
      {folders?.map((folder) => renderFolderRow(folder.id, folder.name, folder.note_count, folder))}
      <Pager page={foldersPage} totalPages={totalPages(foldersTotal)} onChange={(page) => fetchFolders(generationRef.current, page)} t={t} />

      {deletingFolder && (
        <DeleteNoteFolderModal
          folderName={deletingFolder.name}
          noteCount={deletingFolder.note_count}
          onConfirm={() => handleDeleteFolder(deletingFolder)}
          onCancel={() => setDeletingFolder(null)}
          t={t}
        />
      )}
    </div>
  );
}
