"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useAuth } from "@/contexts/AuthContext";
import { isAdmin } from "@/lib/auth-api";
import { useNoteEvents } from "@/contexts/NoteEventsContext";
import { useTeamRoster } from "@/hooks/useTeamRoster";
import {
  createReply,
  createRevision,
  deleteNote,
  getNote,
  listReplies,
  listRevisions,
  updateNote,
  type Note,
  type NoteRevision,
  type Visibility,
} from "@/lib/tack-server-api";
import NoteMarkdown from "@/components/NoteMarkdown";
import MarkdownComposer from "@/components/MarkdownComposer";
import VersionHistory from "@/components/VersionHistory";

interface Props {
  noteId: string;
}

function Icon({ children }: { children: React.ReactNode }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" className="w-4 h-4">
      {children}
    </svg>
  );
}

// Same w-6/h-6 icon-button shape as MarkdownToolbar/EditorToolbar, so
// these read as the same family of control rather than a one-off.
function IconButton({
  title,
  onClick,
  disabled,
  danger,
  children,
}: {
  title: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      disabled={disabled}
      className={`w-6 h-6 rounded flex items-center justify-center transition-colors disabled:opacity-40 ${
        danger ? "text-slate-400 hover:text-red-600 hover:bg-red-50" : "text-slate-400 hover:text-rose-700 hover:bg-slate-100"
      }`}
    >
      {children}
    </button>
  );
}

const historyIcon = (
  <Icon>
    <circle cx="8" cy="8.5" r="5.5" />
    <path d="M8 5.5v3l2.2 1.3" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M5.3 2.3 3.3 3.7M10.7 2.3l2 1.4" strokeLinecap="round" />
  </Icon>
);

const saveVersionIcon = (
  <Icon>
    <path d="M3 2.5h7.5L13 5v8a.5.5 0 0 1-.5.5h-9A.5.5 0 0 1 3 13V3a.5.5 0 0 1 .5-.5Z" strokeLinejoin="round" />
    <path d="M5.5 2.5v3h4v-3" strokeLinejoin="round" />
    <path d="M5.5 9h5v4.5h-5V9Z" strokeLinejoin="round" />
  </Icon>
);

const editIcon = (
  <Icon>
    <path d="M10.5 2.5 13.5 5.5 5.5 13.5H2.5v-3L10.5 2.5Z" strokeLinejoin="round" />
  </Icon>
);

const deleteIcon = (
  <Icon>
    <path d="M3 4.5h10M6 4.5V3a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v1.5" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M4.5 4.5 5 13a1 1 0 0 0 1 1h4a1 1 0 0 0 1-1l.5-8.5" strokeLinecap="round" strokeLinejoin="round" />
  </Icon>
);

/** A Note's own title/visibility/body/edit UI, and its full reply thread.
 * Unlike Pages, Notes have no live collaborative editing -- editing is an
 * explicit request/response cycle (Save button), matching the backend's
 * single-writer markdown model. `canEdit` mirrors `notes_acl.rs`'s exact
 * rule (creator or admin) client-side for UI purposes only -- the backend
 * still enforces this authoritatively on every PATCH/reply/delete. Each
 * reply gets its own edit/delete controls, gated by the same rule applied
 * to that reply's own `created_by` -- a reply is just a `notes` row, so the
 * same endpoints (PATCH/DELETE /notes/:id) work on it directly. Visibility
 * is changed immediately on selection (no separate Save step), same as the
 * title's save-on-blur pattern -- both are metadata fields, not part of the
 * body-edit/version flow.
 *
 * A "Save as version" button calls `createRevision` explicitly -- editing
 * the body (Save) no longer implicitly creates a revision server-side; a
 * version is a deliberate snapshot the note owner chooses to take, not a
 * side effect of every autosave-style edit. Notes have no push/live update
 * mechanism (unlike Pages' Hocuspocus sync), so this subscribes to the
 * single shared refresh timer/button that lives in the Navigator (see
 * NoteEventsContext.tsx) rather than owning its own -- one timer covers
 * both the Notes list and whichever thread is open.
 *
 * The top-level note's current version number is shown next to the
 * "Version history" button, fetched eagerly (one extra request) since
 * there's only one top-level note per thread. If the live body has been
 * edited since that version was saved, an "edited since this version" note
 * appears alongside it -- otherwise there'd be no way to tell whether
 * what's on screen matches the latest saved snapshot or has since drifted.
 * Versioning applies to replies identically (a reply is just a `notes` row
 * with `parent_id` set, so `POST/GET /notes/:id/revisions` work on it the
 * same way) -- each `ReplyItem` gets its own "Save as version"/"History"
 * controls, but deliberately without an eager version-number badge (that
 * would mean one extra request per reply on every load; the number is only
 * fetched when that reply's own history drawer is opened). */
export default function NoteThread({ noteId }: Props) {
  const { token, user } = useAuth();
  const { notifyNoteUpdated, subscribeRefresh } = useNoteEvents();
  const t = useTranslations("notes");

  const [note, setNote] = useState<Note | null>(null);
  const [replies, setReplies] = useState<Note[]>([]);
  const [revisions, setRevisions] = useState<NoteRevision[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [titleDraft, setTitleDraft] = useState("");
  const [titleSaving, setTitleSaving] = useState(false);

  const [visibilitySaving, setVisibilitySaving] = useState(false);

  const [editing, setEditing] = useState(false);
  const [bodyDraft, setBodyDraft] = useState("");
  const [saving, setSaving] = useState(false);

  const [creatingVersion, setCreatingVersion] = useState(false);
  const [versionMessage, setVersionMessage] = useState<string | null>(null);

  const [replyDraft, setReplyDraft] = useState("");
  const [replying, setReplying] = useState(false);

  const [historyOpen, setHistoryOpen] = useState(false);

  const resolveAuthor = useTeamRoster(note?.team_id ?? null);
  const canEditReply = (reply: Note) => Boolean(user) && (user!.id === reply.created_by || isAdmin(token));

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    Promise.all([getNote(token, noteId), listReplies(token, noteId), listRevisions(token, noteId)])
      .then(([n, r, rv]) => {
        if (cancelled) return;
        setNote(n);
        setTitleDraft(n.title);
        setBodyDraft(n.body_markdown);
        setReplies(r);
        setRevisions(rv);
      })
      .catch((e) => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [token, noteId]);

  useEffect(() => {
    return subscribeRefresh(async () => {
      if (!token) return;
      try {
        const [n, r, rv] = await Promise.all([getNote(token, noteId), listReplies(token, noteId), listRevisions(token, noteId)]);
        setNote(n);
        if (!editing) setTitleDraft(n.title);
        if (!editing) setBodyDraft(n.body_markdown);
        setReplies(r);
        setRevisions(rv);
      } catch (e) {
        setError((e as Error).message);
      }
    });
  }, [subscribeRefresh, token, noteId, editing]);

  const canEdit = Boolean(user) && (user!.id === note?.created_by || isAdmin(token));

  async function saveTitle() {
    if (!token || !note || !titleDraft.trim() || titleDraft === note.title) return;
    setTitleSaving(true);
    try {
      const updated = await updateNote(token, note.id, { title: titleDraft.trim() });
      setNote(updated);
      notifyNoteUpdated(updated.id, { title: updated.title });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setTitleSaving(false);
    }
  }

  async function saveVisibility(next: Visibility) {
    if (!token || !note || next === note.visibility) return;
    setVisibilitySaving(true);
    try {
      const updated = await updateNote(token, note.id, { visibility: next });
      setNote(updated);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setVisibilitySaving(false);
    }
  }

  async function saveEdit() {
    if (!token || !note || !bodyDraft.trim()) return;
    setSaving(true);
    try {
      const updated = await updateNote(token, note.id, { body_markdown: bodyDraft.trim() });
      setNote(updated);
      setEditing(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function saveAsVersion() {
    if (!token || !note) return;
    setCreatingVersion(true);
    setVersionMessage(null);
    try {
      const revision = await createRevision(token, note.id);
      setRevisions((prev) => [revision, ...(prev ?? [])]);
      setVersionMessage(t("versionCreated"));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCreatingVersion(false);
    }
  }

  async function submitReply() {
    if (!token || !note || !replyDraft.trim()) return;
    setReplying(true);
    try {
      const reply = await createReply(token, note.id, replyDraft.trim());
      setReplies((prev) => [...prev, reply]);
      setNote((prev) => (prev ? { ...prev, reply_count: prev.reply_count + 1 } : prev));
      setReplyDraft("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setReplying(false);
    }
  }

  async function saveReplyEdit(replyId: string, body: string) {
    if (!token) return;
    const updated = await updateNote(token, replyId, { body_markdown: body.trim() });
    setReplies((prev) => prev.map((r) => (r.id === replyId ? updated : r)));
  }

  async function deleteReply(replyId: string) {
    if (!token) return;
    await deleteNote(token, replyId);
    setReplies((prev) => prev.filter((r) => r.id !== replyId));
    setNote((prev) => (prev ? { ...prev, reply_count: Math.max(0, prev.reply_count - 1) } : prev));
  }

  async function saveReplyVersion(replyId: string) {
    if (!token) return;
    await createRevision(token, replyId);
  }

  if (error) return <p className="p-6 text-red-600">{error}</p>;
  if (!note) return <p className="p-6 text-slate-400">{t("loading")}</p>;

  const latestRevision = revisions?.[0] ?? null;
  const editedSinceLastVersion = latestRevision !== null && latestRevision.body_markdown !== note.body_markdown;

  return (
    <div className="p-6 max-w-3xl space-y-6">
      <div className="flex items-center gap-3">
        {canEdit ? (
          <input
            value={titleDraft}
            onChange={(e) => setTitleDraft(e.target.value)}
            onBlur={saveTitle}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
            }}
            disabled={titleSaving}
            placeholder={t("titlePlaceholder")}
            className="text-xl font-semibold text-slate-800 flex-1 min-w-0 rounded px-1 -mx-1 focus:outline-none focus:ring-1 focus:ring-rose-400"
          />
        ) : (
          <h1 className="text-xl font-semibold text-slate-800 flex-1 min-w-0 truncate">{note.title}</h1>
        )}
      </div>

      <div className="flex items-center gap-2">
        {canEdit ? (
          <select
            value={note.visibility}
            onChange={(e) => saveVisibility(e.target.value as Visibility)}
            disabled={visibilitySaving}
            className="text-xs px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500 border-none focus:outline-none focus:ring-1 focus:ring-rose-400 disabled:opacity-50"
          >
            <option value="private">{t("visibility.private")}</option>
            <option value="team">{t("visibility.team")}</option>
            <option value="organization">{t("visibility.organization")}</option>
          </select>
        ) : (
          <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">
            {t(`visibility.${note.visibility}`)}
          </span>
        )}
        <span className="text-xs text-slate-400">
          {t("editedBy", { name: resolveAuthor(note.created_by) })} · {new Date(note.created_at).toLocaleString()}
        </span>
        <div className="flex-1" />
        {latestRevision && (
          <span className="text-xs text-slate-400">
            {t("version", { n: latestRevision.version })}
            {editedSinceLastVersion && ` · ${t("editedSinceSave")}`}
          </span>
        )}
        <IconButton title={t("versionHistory")} onClick={() => setHistoryOpen(true)}>
          {historyIcon}
        </IconButton>
        {canEdit && (
          <IconButton title={t("createVersion")} onClick={saveAsVersion} disabled={creatingVersion}>
            {saveVersionIcon}
          </IconButton>
        )}
        {canEdit && !editing && (
          <IconButton title={t("edit")} onClick={() => setEditing(true)}>
            {editIcon}
          </IconButton>
        )}
      </div>

      {versionMessage && <p className="text-xs text-green-700">{versionMessage}</p>}

      {editing ? (
        <div className="space-y-2">
          <MarkdownComposer value={bodyDraft} onChange={setBodyDraft} disabled={saving} rows={8} />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setEditing(false);
                setBodyDraft(note.body_markdown);
              }}
              className="text-xs text-slate-500 hover:text-slate-700 px-2 py-1"
            >
              {t("cancel")}
            </button>
            <button
              type="button"
              onClick={saveEdit}
              disabled={saving || !bodyDraft.trim()}
              className="text-xs bg-rose-700 hover:bg-rose-800 disabled:opacity-50 text-white px-3 py-1 rounded"
            >
              {saving ? t("saving") : t("save")}
            </button>
          </div>
        </div>
      ) : (
        <NoteMarkdown body={note.body_markdown} />
      )}

      {replies.length > 0 && (
        <div className="border-t border-slate-200 pt-4 space-y-4">
          {replies.map((reply) => (
            <ReplyItem
              key={reply.id}
              reply={reply}
              authorName={resolveAuthor(reply.created_by)}
              canEdit={canEditReply(reply)}
              onSave={(body) => saveReplyEdit(reply.id, body)}
              onDelete={() => deleteReply(reply.id)}
              onCreateVersion={() => saveReplyVersion(reply.id)}
            />
          ))}
        </div>
      )}

      <div className="border-t border-slate-200 pt-4 space-y-2">
        <MarkdownComposer value={replyDraft} onChange={setReplyDraft} placeholder={t("replyPlaceholder")} disabled={replying} rows={3} />
        <div className="flex justify-end">
          <button
            type="button"
            onClick={submitReply}
            disabled={replying || !replyDraft.trim()}
            className="text-xs bg-rose-700 hover:bg-rose-800 disabled:opacity-50 text-white px-3 py-1 rounded"
          >
            {replying ? t("saving") : t("reply")}
          </button>
        </div>
      </div>

      {historyOpen && <VersionHistory noteId={note.id} onClose={() => setHistoryOpen(false)} />}
    </div>
  );
}

interface ReplyItemProps {
  reply: Note;
  authorName: string;
  canEdit: boolean;
  onSave: (body: string) => Promise<void>;
  onDelete: () => Promise<void>;
  onCreateVersion: () => Promise<void>;
}

/** One reply's own view/edit/delete/version UI. Kept as a subcomponent
 * (rather than a map of edit-state keyed by id in the parent) since each
 * reply's editing/confirm-delete/history state is entirely local to
 * itself. Delete uses a two-step "Delete" -> "Really?"/"Keep it" confirm in
 * place, not `window.confirm` (no first-party app in this org uses the
 * native confirm dialog).
 *
 * Versioning applies to a reply exactly like it does to the top-level note
 * (same backend endpoints, same explicit-save-only rule) -- "Save as
 * version" and "History" are always shown here (not just while editing),
 * since a reply's own body-edit flow has no separate Save-triggers-version
 * step to hang them off. */
function ReplyItem({ reply, authorName, canEdit, onSave, onDelete, onCreateVersion }: ReplyItemProps) {
  const t = useTranslations("notes");
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(reply.body_markdown);
  const [saving, setSaving] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [creatingVersion, setCreatingVersion] = useState(false);
  const [versionMessage, setVersionMessage] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    if (!draft.trim()) return;
    setSaving(true);
    try {
      await onSave(draft);
      setEditing(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      await onDelete();
    } catch (e) {
      setError((e as Error).message);
      setDeleting(false);
      setConfirmingDelete(false);
    }
  }

  async function handleCreateVersion() {
    setCreatingVersion(true);
    setVersionMessage(null);
    try {
      await onCreateVersion();
      setVersionMessage(t("versionCreated"));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCreatingVersion(false);
    }
  }

  return (
    <div className="pl-4 border-l-2 border-slate-200">
      <div className="flex items-center gap-2">
        <span className="text-xs text-slate-400">
          {authorName} · {new Date(reply.created_at).toLocaleString()}
        </span>
        <div className="flex-1" />
        {!confirmingDelete && (
          <IconButton title={t("history")} onClick={() => setHistoryOpen(true)}>
            {historyIcon}
          </IconButton>
        )}
        {canEdit && !editing && !confirmingDelete && (
          <>
            <IconButton title={t("createVersion")} onClick={handleCreateVersion} disabled={creatingVersion}>
              {saveVersionIcon}
            </IconButton>
            <IconButton title={t("edit")} onClick={() => setEditing(true)}>
              {editIcon}
            </IconButton>
            <IconButton title={t("delete")} onClick={() => setConfirmingDelete(true)} danger>
              {deleteIcon}
            </IconButton>
          </>
        )}
        {confirmingDelete && (
          <>
            <span className="text-xs text-slate-500">{t("deleteConfirm")}</span>
            <button
              type="button"
              onClick={() => setConfirmingDelete(false)}
              disabled={deleting}
              className="text-xs text-slate-400 hover:text-slate-600"
            >
              {t("deleteCancel")}
            </button>
            <button
              type="button"
              onClick={handleDelete}
              disabled={deleting}
              className="text-xs text-red-600 hover:text-red-800 font-medium disabled:opacity-50"
            >
              {deleting ? t("saving") : t("delete")}
            </button>
          </>
        )}
      </div>

      {error && <p className="text-xs text-red-600">{error}</p>}
      {versionMessage && <p className="text-xs text-green-700">{versionMessage}</p>}

      {editing ? (
        <div className="space-y-2 mt-1">
          <MarkdownComposer value={draft} onChange={setDraft} disabled={saving} rows={3} />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setEditing(false);
                setDraft(reply.body_markdown);
              }}
              className="text-xs text-slate-500 hover:text-slate-700 px-2 py-1"
            >
              {t("cancel")}
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || !draft.trim()}
              className="text-xs bg-rose-700 hover:bg-rose-800 disabled:opacity-50 text-white px-3 py-1 rounded"
            >
              {saving ? t("saving") : t("save")}
            </button>
          </div>
        </div>
      ) : (
        <NoteMarkdown body={reply.body_markdown} />
      )}

      {historyOpen && <VersionHistory noteId={reply.id} onClose={() => setHistoryOpen(false)} />}
    </div>
  );
}
