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
  getNote,
  listReplies,
  updateNote,
  type Note,
} from "@/lib/tack-server-api";
import NoteMarkdown from "@/components/NoteMarkdown";
import MarkdownComposer from "@/components/MarkdownComposer";
import VersionHistory from "@/components/VersionHistory";
import RefreshControl from "@/components/RefreshControl";

interface Props {
  noteId: string;
}

/** A Note's own title/body/edit UI, and its full reply thread. Unlike
 * Pages, Notes have no live collaborative editing -- editing is an explicit
 * request/response cycle (Save button), matching the backend's
 * single-writer markdown model. `canEdit` mirrors `notes_acl.rs`'s exact
 * rule (creator or admin) client-side for UI purposes only -- the backend
 * still enforces this authoritatively on every PATCH/reply.
 *
 * A "Save as version" button calls `createRevision` explicitly -- editing
 * the body (Save) no longer implicitly creates a revision server-side; a
 * version is a deliberate snapshot the note owner chooses to take, not a
 * side effect of every autosave-style edit. Notes have no push/live update
 * mechanism (unlike Pages' Hocuspocus sync), so `RefreshControl` is how a
 * user sees replies/edits made by someone else. */
export default function NoteThread({ noteId }: Props) {
  const { token, user } = useAuth();
  const { notifyNoteUpdated } = useNoteEvents();
  const t = useTranslations("notes");

  const [note, setNote] = useState<Note | null>(null);
  const [replies, setReplies] = useState<Note[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [titleDraft, setTitleDraft] = useState("");
  const [titleSaving, setTitleSaving] = useState(false);

  const [editing, setEditing] = useState(false);
  const [bodyDraft, setBodyDraft] = useState("");
  const [saving, setSaving] = useState(false);

  const [creatingVersion, setCreatingVersion] = useState(false);
  const [versionMessage, setVersionMessage] = useState<string | null>(null);

  const [replyDraft, setReplyDraft] = useState("");
  const [replying, setReplying] = useState(false);

  const [historyOpen, setHistoryOpen] = useState(false);

  const resolveAuthor = useTeamRoster(note?.team_id ?? null);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    Promise.all([getNote(token, noteId), listReplies(token, noteId)])
      .then(([n, r]) => {
        if (cancelled) return;
        setNote(n);
        setTitleDraft(n.title);
        setBodyDraft(n.body_markdown);
        setReplies(r);
      })
      .catch((e) => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [token, noteId]);

  async function refresh() {
    if (!token) return;
    try {
      const [n, r] = await Promise.all([getNote(token, noteId), listReplies(token, noteId)]);
      setNote(n);
      if (!editing) setTitleDraft(n.title);
      if (!editing) setBodyDraft(n.body_markdown);
      setReplies(r);
    } catch (e) {
      setError((e as Error).message);
    }
  }

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
      await createRevision(token, note.id);
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

  if (error) return <p className="p-6 text-red-600">{error}</p>;
  if (!note) return <p className="p-6 text-slate-400">{t("loading")}</p>;

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
        <RefreshControl onRefresh={refresh} storageKey="tack_note_refresh_interval" />
      </div>

      <div className="flex items-center gap-2">
        <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">
          {t(`visibility.${note.visibility}`)}
        </span>
        <span className="text-xs text-slate-400">
          {t("editedBy", { name: resolveAuthor(note.created_by) })} · {new Date(note.created_at).toLocaleString()}
        </span>
        <div className="flex-1" />
        <button type="button" onClick={() => setHistoryOpen(true)} className="text-xs text-slate-500 hover:text-rose-700">
          {t("versionHistory")}
        </button>
        {canEdit && (
          <button
            type="button"
            onClick={saveAsVersion}
            disabled={creatingVersion}
            className="text-xs text-slate-500 hover:text-rose-700 disabled:opacity-50"
          >
            {creatingVersion ? t("saving") : t("createVersion")}
          </button>
        )}
        {canEdit && !editing && (
          <button type="button" onClick={() => setEditing(true)} className="text-xs text-slate-500 hover:text-rose-700">
            {t("edit")}
          </button>
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
            <div key={reply.id} className="pl-4 border-l-2 border-slate-200">
              <span className="text-xs text-slate-400">
                {resolveAuthor(reply.created_by)} · {new Date(reply.created_at).toLocaleString()}
              </span>
              <NoteMarkdown body={reply.body_markdown} />
            </div>
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
