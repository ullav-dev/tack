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

// See folderScope="team"'s doc comment above -- matches the limit togra's
// own prior chip bar effectively had (it fetched everything, unpaginated).
const TEAM_FOLDERS_LIMIT = 200;

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
  resolveAuthor: (userId: string, teamId: string | null, note?: Note) => string;
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
  /** Where the folder chips (when `showFolders`) come from:
   * - "entity" (default): this one entity's own folders, via `GET
   *   /note-folders/by-entity` -- cunav's model, a folder scoped to one
   *   ticket.
   * - "team": the caller's whole team folder list, via `GET
   *   /note-folders?team_id=` -- togra's model, one team-wide folder set
   *   a note (attached to any entity type) can be filed into, matching
   *   what its own pre-migration NotesPanel already did. Fetched with a
   *   generously large single-page limit, same as togra's own prior
   *   unpaginated chip bar -- a team folder *count* growing past that is
   *   a pre-existing constraint carried over, not solved here; the chip-
   *   bar UI isn't built for a real Pager the way `NoteTree`'s browse
   *   view is.
   *
   *   Folder *delete* is hidden entirely in "team" mode: tack-server's
   *   `DELETE /note-folders/:id` unfiles every note in that folder
   *   org-wide, not just this entity's -- a destructive, team-wide action
   *   whose blast radius this panel (scoped to one entity) can't show the
   *   caller. Create/rename stay available (non-destructive). */
  folderScope?: "entity" | "team";
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
  /** When set, the new-note form has no title field at all -- every note
   * this panel creates is titled with this fixed string instead (e.g.
   * lagan's PR discussion, where a note is really just a flat comment and
   * asking for a title would be pure friction with no reader ever seeing
   * it). Leave unset for the normal title input (cunav/togra/awe-client's
   * entity notes, where a real title is part of the note). */
  autoTitle?: string;
  /** Show an unread dot per note (via `note_reads`), and mark a note read
   * when it's opened. Default true. */
  showUnreadBadges?: boolean;
  /** Bump this to silently re-fetch the list in the background (e.g. a host
   * app's own polling), without disturbing the current selection. */
  refreshSignal?: number;
  /** Extra per-row actions (e.g. cunav's "send as email") rendered at the
   * right edge of each list row; clicks inside it don't select the row. */
  renderNoteActions?: (note: Note) => ReactNode;
  /** Renders arbitrary host-specific content directly below a selected
   * note's own body, e.g. cartlann's object-link editor. Threaded straight
   * through to `TackNoteThread`'s own `renderDetailExtra` -- see its doc
   * comment. */
  renderDetailExtra?: (note: Note) => ReactNode;
  ImagePicker?: ComponentType<{ onSelect: (asset: { url: string; name: string }) => void; onClose: () => void }>;
  /** Opens the new-note form pre-filled with this title/body, e.g. a host
   * app's "save this AI response as a note" action from a sibling panel
   * that has no note of its own to attach to yet. Consumed once (the form
   * opens and is pre-filled) and then `onInitialDraftConsumed` fires so the
   * host can clear its own state -- passing the same object again would
   * otherwise silently do nothing (further edits inside the form are never
   * clobbered by a stale draft). */
  initialDraft?: { title?: string; body_markdown: string } | null;
  onInitialDraftConsumed?: () => void;
}

/** An embeddable "notes attached to one entity" widget -- list + inline
 * create + a selected note's full detail (reusing `TackNoteThread` as-is
 * for the detail pane, rather than re-building view/edit/reply/version/
 * export from scratch). This is the shape every AWE-based app's own
 * `NotesPanel` actually needs (a thread per ticket/workflow/job), unlike
 * `TackNoteTree`, which is tack's own app-specific "browse my whole team's
 * notes by folder" Navigator experience. Backed by `GET /notes/by-entity`,
 * not `GET /notes`. Folder chrome (`showFolders`) is optional and, via
 * `folderScope`, can be scoped either to this one entity (cunav's model)
 * or to the caller's whole team (togra's model, matching what a note
 * filed under any entity type could already be organized into pre-
 * migration) -- see each prop's own doc comment. */
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
  folderScope = "entity",
  compact = false,
  twoColumn = false,
  autoSelectFirst = false,
  defaultVisibility = "team",
  autoTitle,
  showUnreadBadges = true,
  refreshSignal,
  renderNoteActions,
  renderDetailExtra,
  ImagePicker,
  initialDraft,
  onInitialDraftConsumed,
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

  useEffect(() => {
    if (!initialDraft) return;
    setSelectedId(null);
    setCreating(true);
    setNewTitle(initialDraft.title ?? "");
    setNewBody(initialDraft.body_markdown);
    setNewVisibility(defaultVisibility);
    onInitialDraftConsumed?.();
    // initialDraft is consumed once by identity, not re-applied on every
    // render -- onInitialDraftConsumed is expected to clear it on the host
    // side. defaultVisibility/onInitialDraftConsumed deliberately excluded
    // from deps: re-running this on their change (rather than only when a
    // *new* draft object arrives) would reopen/reset the form under the
    // user while they're mid-edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialDraft]);

  async function load(silent = false) {
    if (!silent) setError(null);
    try {
      const loadFolders = () =>
        folderScope === "team"
          ? api.listNoteFolders(teamId, { limit: TEAM_FOLDERS_LIMIT }).then((p) => p.folders)
          : api.listNoteFoldersByAttachment(owningService, entityType, entityId);
      const [result] = await Promise.all([
        api.listNotesByAttachment(owningService, entityType, entityId),
        showFolders
          ? loadFolders()
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
    if ((!autoTitle && !newTitle.trim()) || !newBody.trim()) return;
    setSubmitting(true);
    try {
      const note = await api.createNote({
        team_id: teamId,
        visibility: newVisibility,
        title: autoTitle ?? newTitle.trim(),
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
        ...(folderScope === "team" ? {} : { attach: { owning_service: owningService, entity_type: entityType, entity_id: entityId } }),
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
              {!autoTitle && (
                <input
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder={t("titlePlaceholder")}
                  disabled={submitting}
                  className="box-border w-full text-sm rounded border border-slate-200 px-2 py-1 focus:outline-none focus:ring-1 focus:ring-[var(--tnotes-400,#fb7185)]"
                />
              )}
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
                  disabled={submitting || (!autoTitle && !newTitle.trim()) || !newBody.trim()}
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
              className="box-border w-full flex items-center justify-center gap-1.5 text-xs font-medium text-[var(--tnotes-700,#be123c)] hover:bg-[var(--tnotes-50,#fff1f2)] rounded px-2 py-1.5"
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
                  {folderScope !== "team" && (
                    <IconButton title={t("deleteFolder")} onClick={() => removeFolder(folder)} danger>
                      {deleteIcon}
                    </IconButton>
                  )}
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
                      {resolveAuthor(note.created_by, note.team_id, note)} · {new Date(note.created_at).toLocaleDateString()}
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
      renderDetailExtra={renderDetailExtra}
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
