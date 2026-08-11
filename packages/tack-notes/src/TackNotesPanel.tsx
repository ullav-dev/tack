"use client";

import { useEffect, useState, type ComponentType, type ReactNode } from "react";
import { useNoteEvents } from "./NoteEventsContext";
import type { Note, NoteFolder, TackNotesApi, Visibility } from "./api";
import TackNoteThread from "./TackNoteThread";
import MarkdownComposer from "./MarkdownComposer";
import ResizableSplit from "./ResizableSplit";
import { plusIcon, noteIcon, folderIcon, editIcon, deleteIcon, IconButton } from "./Icon";
import type { TFunction } from "./types";

type FolderFilter = "all" | "mine" | "shared" | string;

export interface TackNotesPanelProps {
  api: TackNotesApi;
  /** The entity this panel's notes are attached to (`content_attachments`),
   * e.g. a cunav ticket, a togra workflow -- see `GET /notes/by-entity`.
   * Every note this panel lists and creates is scoped to this one triple. */
  owningService: string;
  entityType: string;
  entityId: string;
  /** The team new notes get filed under. Existing notes may belong to a
   * different team than the caller's current one (an entity can outlive a
   * team switch) -- `resolveAuthor` still takes each note's own `team_id`. */
  teamId: string;
  currentUserId: string;
  isAdmin: boolean;
  resolveAuthor: (userId: string, teamId: string | null) => string;
  t: TFunction;
  /** Whether the caller may create notes/replies here at all. Default true.
   * Editing/deleting an individual note is still governed by
   * `TackNoteThread`'s own creator-or-admin rule regardless of this prop. */
  editable?: boolean;
  /** Show this entity's own folders (quick "all"/"mine"/"shared" filters,
   * plus real folder create/rename/delete) via `GET /note-folders/by-
   * entity`. Default true. Set false for a minimal list with no folder
   * chrome at all. */
  showFolders?: boolean;
  /** Narrower list rows, smaller type -- for a sidebar-widget placement.
   * Default false. */
  compact?: boolean;
  /** List and detail side by side via a draggable `ResizableSplit`, instead
   * of the default "list, then detail in its place" stacked layout. Default
   * false. */
  twoColumn?: boolean;
  /** Select the first note automatically once the list loads (only on the
   * initial load -- never re-triggers after that). Default false. */
  autoSelectFirst?: boolean;
  /** Visibility offered by default in the new-note form. Default "team". */
  defaultVisibility?: Visibility;
  /** Show an unread dot per note (via `note_reads`), and mark a note read
   * when it's opened. Default true. */
  showUnreadBadges?: boolean;
  /** Bump this to silently re-fetch the list in the background (e.g. a host
   * app's own polling), without disturbing the current selection. */
  refreshSignal?: number;
  /** Extra per-row actions (e.g. cunav's "send as email") rendered at the
   * right edge of each list row; clicks inside it don't select the row. */
  renderNoteActions?: (note: Note) => ReactNode;
  ImagePicker?: ComponentType<{ onSelect: (asset: { url: string; name: string }) => void; onClose: () => void }>;
}

/** An embeddable "notes attached to one entity" widget -- list + inline
 * create + a selected note's full detail (reusing `TackNoteThread` as-is
 * for the detail pane, rather than re-building view/edit/reply/version/
 * export from scratch). This is the shape every AWE-based app's own
 * `NotesPanel` actually needs (a thread per ticket/workflow/job), unlike
 * `TackNoteTree`, which is tack's own app-specific "browse my whole team's
 * notes by folder" Navigator experience. Backed by `GET /notes/by-entity`,
 * not `GET /notes` -- there is no folder concept here at all, since an
 * entity-attached note was never filed into one. */
export default function TackNotesPanel({
  api,
  owningService,
  entityType,
  entityId,
  teamId,
  currentUserId,
  isAdmin,
  resolveAuthor,
  t,
  editable = true,
  showFolders = true,
  compact = false,
  twoColumn = false,
  autoSelectFirst = false,
  defaultVisibility = "team",
  showUnreadBadges = true,
  refreshSignal,
  renderNoteActions,
  ImagePicker,
}: TackNotesPanelProps) {
  const { subscribe, subscribeDeleted, subscribeRefresh } = useNoteEvents();

  const [notes, setNotes] = useState<Note[] | null>(null);
  const [folders, setFolders] = useState<NoteFolder[]>([]);
  const [activeFolder, setActiveFolder] = useState<FolderFilter>("all");
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [renamingFolderId, setRenamingFolderId] = useState<string | null>(null);
  const [renameFolderName, setRenameFolderName] = useState("");
  const [unread, setUnread] = useState<Record<string, boolean>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newBody, setNewBody] = useState("");
  const [newVisibility, setNewVisibility] = useState<Visibility>(defaultVisibility);
  const [submitting, setSubmitting] = useState(false);

  async function load(silent = false) {
    if (!silent) setError(null);
    try {
      const [result] = await Promise.all([
        api.listNotesByAttachment(owningService, entityType, entityId),
        showFolders
          ? api
              .listNoteFoldersByAttachment(owningService, entityType, entityId)
              .then((f) => setFolders([...f].sort((a, b) => a.name.localeCompare(b.name))))
              .catch(() => {
                /* Non-fatal: folder chrome just won't offer choices. */
              })
          : Promise.resolve(),
      ]);
      setNotes(result);
      if (showUnreadBadges && result.length > 0) {
        api
          .listUnread(result.map((n) => n.id))
          .then((statuses) => setUnread(Object.fromEntries(statuses.map((s) => [s.note_id, s.unread]))))
          .catch(() => {
            /* Non-fatal: the list still renders, just without unread dots. */
          });
      }
      return result;
    } catch (e) {
      if (!silent) setError((e as Error).message);
      return null;
    }
  }

  // Re-fetches (and drops any selection) whenever the panel is pointed at a
  // different entity -- selection from a previously-viewed ticket must never
  // leak into the next one's detail pane.
  useEffect(() => {
    let cancelled = false;
    setNotes(null);
    setFolders([]);
    setActiveFolder("all");
    setSelectedId(null);
    load().then((result) => {
      if (!cancelled && autoSelectFirst && result && result.length > 0) {
        setSelectedId(result[0].id);
      }
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [owningService, entityType, entityId]);

  useEffect(() => {
    if (refreshSignal === undefined) return;
    load(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshSignal]);

  useEffect(() => {
    return subscribe((noteId, patch) => {
      setNotes((prev) => (prev ? prev.map((n) => (n.id === noteId ? { ...n, ...patch } : n)) : prev));
    });
  }, [subscribe]);

  useEffect(() => {
    return subscribeDeleted((noteId) => {
      setNotes((prev) => (prev ? prev.filter((n) => n.id !== noteId) : prev));
      setSelectedId((prev) => (prev === noteId ? null : prev));
    });
  }, [subscribeDeleted]);

  useEffect(() => subscribeRefresh(async () => void (await load(true))), [subscribeRefresh]);

  async function submitNew() {
    if (!newTitle.trim() || !newBody.trim()) return;
    setSubmitting(true);
    try {
      const note = await api.createNote({
        team_id: teamId,
        visibility: newVisibility,
        title: newTitle.trim(),
        body_markdown: newBody.trim(),
        attach: { owning_service: owningService, entity_type: entityType, entity_id: entityId },
      });
      setNotes((prev) => [...(prev ?? []), note]);
      setNewTitle("");
      setNewBody("");
      setCreating(false);
      setSelectedId(note.id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  async function submitNewFolder() {
    if (!newFolderName.trim()) return;
    try {
      const folder = await api.createNoteFolder({
        team_id: teamId,
        name: newFolderName.trim(),
        attach: { owning_service: owningService, entity_type: entityType, entity_id: entityId },
      });
      setFolders((prev) => [...prev, folder].sort((a, b) => a.name.localeCompare(b.name)));
      setNewFolderName("");
      setCreatingFolder(false);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function submitRenameFolder(id: string, name: string) {
    if (!name.trim()) {
      setRenamingFolderId(null);
      return;
    }
    try {
      const updated = await api.renameNoteFolder(id, name.trim());
      setFolders((prev) => prev.map((f) => (f.id === updated.id ? updated : f)).sort((a, b) => a.name.localeCompare(b.name)));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRenamingFolderId(null);
    }
  }

  async function removeFolder(folder: NoteFolder) {
    try {
      await api.deleteNoteFolder(folder.id);
      setFolders((prev) => prev.filter((f) => f.id !== folder.id));
      setNotes((prev) => (prev ? prev.map((n) => (n.folder_id === folder.id ? { ...n, folder_id: null } : n)) : prev));
      if (activeFolder === folder.id) setActiveFolder("all");
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const filteredNotes = (notes ?? []).filter((n) => {
    if (activeFolder === "all") return true;
    if (activeFolder === "mine") return n.created_by === currentUserId;
    if (activeFolder === "shared") return n.visibility !== "private";
    return n.folder_id === activeFolder;
  });

  function handleSelect(id: string) {
    setSelectedId(id);
    if (showUnreadBadges && unread[id]) {
      api
        .markNoteRead(id)
        .then(() => setUnread((prev) => ({ ...prev, [id]: false })))
        .catch(() => {
          /* Non-fatal: the badge just won't clear until the next load. */
        });
    }
  }

  const listPane = (
    <div className="flex flex-col h-full min-h-0">
      {editable && (
        <div className="p-2 border-b border-slate-200 print:hidden">
          {creating ? (
            <div className="space-y-2">
              <input
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder={t("titlePlaceholder")}
                disabled={submitting}
                className="w-full text-sm rounded border border-slate-200 px-2 py-1 focus:outline-none focus:ring-1 focus:ring-[var(--tnotes-400,#fb7185)]"
              />
              <MarkdownComposer
                value={newBody}
                onChange={setNewBody}
                disabled={submitting}
                rows={compact ? 3 : 4}
                t={t}
                ImagePicker={ImagePicker}
              />
              <div className="flex items-center gap-2">
                <select
                  value={newVisibility}
                  onChange={(e) => setNewVisibility(e.target.value as Visibility)}
                  disabled={submitting}
                  className="text-xs px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500 border-none focus:outline-none focus:ring-1 focus:ring-[var(--tnotes-400,#fb7185)]"
                >
                  <option value="private">{t("visibility.private")}</option>
                  <option value="team">{t("visibility.team")}</option>
                  <option value="organization">{t("visibility.organization")}</option>
                </select>
                <div className="flex-1" />
                <button
                  type="button"
                  onClick={() => {
                    setCreating(false);
                    setNewTitle("");
                    setNewBody("");
                  }}
                  disabled={submitting}
                  className="text-xs text-slate-500 hover:text-slate-700 px-2 py-1"
                >
                  {t("cancel")}
                </button>
                <button
                  type="button"
                  onClick={submitNew}
                  disabled={submitting || !newTitle.trim() || !newBody.trim()}
                  className="text-xs bg-[var(--tnotes-700,#be123c)] hover:bg-[var(--tnotes-800,#9f1239)] disabled:opacity-50 text-white px-3 py-1 rounded"
                >
                  {submitting ? t("saving") : t("save")}
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setCreating(true)}
              className="w-full flex items-center justify-center gap-1.5 text-xs font-medium text-[var(--tnotes-700,#be123c)] hover:bg-[var(--tnotes-50,#fff1f2)] rounded px-2 py-1.5"
            >
              {plusIcon}
              {t("addNote")}
            </button>
          )}
        </div>
      )}

      {showFolders && notes !== null && (
        <div className="flex items-center gap-1 overflow-x-auto px-2 py-1.5 border-b border-slate-100 shrink-0 print:hidden">
          {(["all", "mine", "shared"] as const).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setActiveFolder(key)}
              className={`shrink-0 text-xs px-2 py-1 rounded-full transition-colors whitespace-nowrap ${
                activeFolder === key ? "bg-[var(--tnotes-100,#ffe4e6)] text-[var(--tnotes-700,#be123c)] font-medium" : "text-slate-500 hover:bg-slate-100"
              }`}
            >
              {t(key === "all" ? "folderFilterAll" : key === "mine" ? "folderFilterMine" : "folderFilterShared")}
            </button>
          ))}
          {folders.length > 0 && <span className="text-slate-200 shrink-0">|</span>}
          {folders.map((folder) =>
            renamingFolderId === folder.id ? (
              <form
                key={folder.id}
                onSubmit={(e) => {
                  e.preventDefault();
                  submitRenameFolder(folder.id, renameFolderName);
                }}
                className="shrink-0"
              >
                <input
                  autoFocus
                  value={renameFolderName}
                  onChange={(e) => setRenameFolderName(e.target.value)}
                  onBlur={() => submitRenameFolder(folder.id, renameFolderName)}
                  className="text-xs border border-[var(--tnotes-300,#fda4af)] rounded-full px-2 py-1 focus:outline-none w-28"
                />
              </form>
            ) : (
              <div key={folder.id} className="group shrink-0 flex items-center gap-0.5">
                <button
                  type="button"
                  onClick={() => setActiveFolder(folder.id)}
                  className={`flex items-center gap-1 text-xs px-2 py-1 rounded-full transition-colors whitespace-nowrap ${
                    activeFolder === folder.id
                      ? "bg-[var(--tnotes-100,#ffe4e6)] text-[var(--tnotes-700,#be123c)] font-medium"
                      : "text-slate-500 hover:bg-slate-100"
                  }`}
                >
                  <span className="w-3 h-3">{folderIcon}</span>
                  {folder.name}
                </button>
                <div className="hidden group-hover:flex items-center gap-0.5">
                  <IconButton
                    title={t("renameFolder")}
                    onClick={() => {
                      setRenamingFolderId(folder.id);
                      setRenameFolderName(folder.name);
                    }}
                  >
                    {editIcon}
                  </IconButton>
                  <IconButton title={t("deleteFolder")} onClick={() => removeFolder(folder)} danger>
                    {deleteIcon}
                  </IconButton>
                </div>
              </div>
            )
          )}
          {creatingFolder ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                submitNewFolder();
              }}
              className="shrink-0"
            >
              <input
                autoFocus
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                onBlur={() => {
                  if (!newFolderName.trim()) setCreatingFolder(false);
                }}
                placeholder={t("newFolderName")}
                className="text-xs border border-[var(--tnotes-300,#fda4af)] rounded-full px-2 py-1 focus:outline-none w-28"
              />
            </form>
          ) : (
            <button
              type="button"
              onClick={() => {
                setCreatingFolder(true);
                setNewFolderName("");
              }}
              className="shrink-0 text-xs px-2 py-1 text-slate-400 hover:text-[var(--tnotes-700,#be123c)] transition-colors"
              title={t("newFolder")}
            >
              + {t("newFolder")}
            </button>
          )}
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-y-auto">
        {error && <p className="p-3 text-xs text-red-600">{error}</p>}
        {notes === null ? (
          <p className="p-3 text-xs text-slate-400">{t("loading")}</p>
        ) : filteredNotes.length === 0 ? (
          <p className="p-3 text-xs text-slate-400">{t("noNotes")}</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {filteredNotes.map((note) => (
              <li
                key={note.id}
                className={`flex items-start gap-2 px-3 py-2 hover:bg-slate-50 ${
                  selectedId === note.id ? "bg-[var(--tnotes-50,#fff1f2)]" : ""
                } ${compact ? "text-xs" : "text-sm"}`}
              >
                {/* A plain div, not a button, wraps the row -- renderNoteActions
                    (e.g. cunav's "send as email") can render its own button
                    here, and a button can't nest another interactive element. */}
                <button type="button" onClick={() => handleSelect(note.id)} className="flex-1 min-w-0 flex items-start gap-2 text-left">
                  <span className="text-slate-400 shrink-0 mt-0.5">{noteIcon}</span>
                  <span className="flex-1 min-w-0">
                    <span className="flex items-center gap-1.5">
                      {showUnreadBadges && unread[note.id] && (
                        <span
                          className="w-1.5 h-1.5 rounded-full bg-[var(--tnotes-700,#be123c)] shrink-0"
                          aria-label={t("unread")}
                        />
                      )}
                      <span className="font-medium text-slate-800 truncate">{note.title || t("untitled")}</span>
                    </span>
                    <span className="block text-[11px] text-slate-400 truncate">
                      {resolveAuthor(note.created_by, note.team_id)} · {new Date(note.created_at).toLocaleDateString()}
                      {showFolders &&
                        note.folder_id &&
                        (() => {
                          const folder = folders.find((f) => f.id === note.folder_id);
                          return folder ? ` · ${folder.name}` : null;
                        })()}
                    </span>
                  </span>
                </button>
                {renderNoteActions && <span className="shrink-0">{renderNoteActions(note)}</span>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );

  const detailPane = selectedId ? (
    <TackNoteThread
      key={selectedId}
      noteId={selectedId}
      api={api}
      currentUserId={currentUserId}
      isAdmin={isAdmin}
      resolveAuthor={resolveAuthor}
      t={t}
      onNavigateAfterDelete={() => setSelectedId(null)}
      ImagePicker={ImagePicker}
      folders={showFolders ? folders : []}
    />
  ) : (
    <p className="p-6 text-sm text-slate-400">{t("selectNote")}</p>
  );

  if (twoColumn) {
    return (
      <div className="h-full min-h-0">
        <ResizableSplit
          storageKey={`tack-notes-panel-${owningService}-${entityType}`}
          left={listPane}
          right={detailPane}
          defaultWidth={compact ? 220 : 288}
        />
      </div>
    );
  }

  if (selectedId) {
    return (
      <div className="h-full min-h-0 flex flex-col">
        <button
          type="button"
          onClick={() => setSelectedId(null)}
          className="text-xs text-slate-500 hover:text-[var(--tnotes-700,#be123c)] px-3 py-2 text-left print:hidden"
        >
          ← {t("backToList")}
        </button>
        <div className="flex-1 min-h-0 overflow-y-auto">{detailPane}</div>
      </div>
    );
  }

  return listPane;
}
