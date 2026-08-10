"use client";

import { useEffect, useState, type ComponentType, type ReactNode } from "react";
import { useNoteEvents } from "./NoteEventsContext";
import type { Note, TackNotesApi, Visibility } from "./api";
import TackNoteThread from "./TackNoteThread";
import MarkdownComposer from "./MarkdownComposer";
import ResizableSplit from "./ResizableSplit";
import { plusIcon, noteIcon } from "./Icon";
import type { TFunction } from "./types";

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
      const result = await api.listNotesByAttachment(owningService, entityType, entityId);
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

      <div className="flex-1 min-h-0 overflow-y-auto">
        {error && <p className="p-3 text-xs text-red-600">{error}</p>}
        {notes === null ? (
          <p className="p-3 text-xs text-slate-400">{t("loading")}</p>
        ) : notes.length === 0 ? (
          <p className="p-3 text-xs text-slate-400">{t("noNotes")}</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {notes.map((note) => (
              <li key={note.id}>
                <button
                  type="button"
                  onClick={() => handleSelect(note.id)}
                  className={`w-full text-left px-3 py-2 flex items-start gap-2 hover:bg-slate-50 ${
                    selectedId === note.id ? "bg-[var(--tnotes-50,#fff1f2)]" : ""
                  } ${compact ? "text-xs" : "text-sm"}`}
                >
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
                    </span>
                  </span>
                  {renderNoteActions && (
                    <span onClick={(e) => e.stopPropagation()} className="shrink-0">
                      {renderNoteActions(note)}
                    </span>
                  )}
                </button>
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
