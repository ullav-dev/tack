"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { isAdmin } from "@/lib/auth-api";
import { useNoteEvents } from "@/contexts/NoteEventsContext";
import { useTeamRoster } from "@/hooks/useTeamRoster";
import {
  createReply,
  createRevision,
  deleteNote,
  getNote,
  listNoteFolders,
  listReplies,
  listRevisions,
  updateNote,
  type Note,
  type NoteFolder,
  type NoteRevision,
  type Visibility,
} from "@/lib/tack-server-api";
import NoteMarkdown, { markdownToHtml } from "@/components/NoteMarkdown";
import MarkdownComposer from "@/components/MarkdownComposer";
import VersionHistory from "@/components/VersionHistory";
import DeleteNoteModal from "@/components/DeleteNoteModal";
import ConfirmExportOldVersionModal from "@/components/ConfirmExportOldVersionModal";
import { downloadFile, escapeHtml, slugify, wrapHtmlDocument } from "@/lib/export";
import { Icon, IconButton, editIcon, deleteIcon } from "@/components/Icon";

interface Props {
  noteId: string;
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

const downloadMarkdownIcon = (
  <Icon>
    <path d="M8 2v7M5 6l3 3 3-3" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M3 12.5h10" strokeLinecap="round" />
  </Icon>
);

const downloadHtmlIcon = (
  <Icon>
    <path d="M5 4 2 8l3 4M11 4l3 4-3 4" strokeLinecap="round" strokeLinejoin="round" />
  </Icon>
);

const printIcon = (
  <Icon>
    <rect x="3" y="6" width="10" height="5" rx="0.8" />
    <path d="M4.5 6V3h7v3M4.5 11v2h7v-2" strokeLinecap="round" strokeLinejoin="round" />
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
 * fetched when that reply's own history drawer is opened).
 *
 * A reply is tagged (server-side, at creation) with whichever version of
 * the parent note was current when it was written (`in_reply_to_version`).
 * The thread's normal view only shows replies tagged with the *current*
 * latest version -- a reply made against v1 stops being shown once the
 * owner explicitly saves v2, since it was a comment on the old body, not
 * the new one. Older-tagged replies aren't just dropped, though: a small
 * "N replies from earlier versions" note links out to the history drawer,
 * which shows each version's own replies alongside its snapshot.
 *
 * Deleting the note itself (not a version) opens `DeleteNoteModal` --
 * cascades to every version and reply server-side, so it needs an explicit,
 * properly worded confirmation rather than an inline icon-click.
 *
 * "View this version" in the history drawer sets `viewingRevision`, which
 * swaps the main panel into a read-only view of that snapshot (body +
 * that version's own scoped replies) with an amber-tinted banner and body
 * background so it's visually obvious this isn't the live state, plus a
 * "Show latest" button to snap back. Selecting the version that already
 * *is* the latest is treated as "show latest" (clears `viewingRevision`
 * rather than pointlessly setting it), so the banner never shows for the
 * current state. All edit affordances (title, visibility, body edit,
 * "Save as version", delete-note, replying) are gated on `!viewingRevision`
 * too -- editing a historical snapshot in place doesn't make sense; the
 * user has to return to latest first.
 *
 * Export (F6): Markdown/HTML download build directly off whatever's
 * currently displayed (`displayedBody`/`displayedReplies`), so exporting
 * while browsing an old version exports that version, not the live one.
 * PDF export is just `window.print()` -- the workspace shell (Nav, Footer,
 * Navigator) and every edit-only control here are `print:hidden`, so the
 * printed/saved-as-PDF output is just the title, metadata, body, and
 * current replies -- no new rendering service, per the confirmed plan
 * decision. */
export default function NoteThread({ noteId }: Props) {
  const { token, user } = useAuth();
  const { notifyNoteUpdated, notifyNoteDeleted, subscribeRefresh } = useNoteEvents();
  const router = useRouter();
  const t = useTranslations("notes");

  const [note, setNote] = useState<Note | null>(null);
  const [replies, setReplies] = useState<Note[]>([]);
  const [revisions, setRevisions] = useState<NoteRevision[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [titleDraft, setTitleDraft] = useState("");
  const [titleSaving, setTitleSaving] = useState(false);

  const [visibilitySaving, setVisibilitySaving] = useState(false);

  const [folders, setFolders] = useState<NoteFolder[] | null>(null);
  const [folderSaving, setFolderSaving] = useState(false);

  const [editing, setEditing] = useState(false);
  const [bodyDraft, setBodyDraft] = useState("");
  const [saving, setSaving] = useState(false);

  const [creatingVersion, setCreatingVersion] = useState(false);
  const [versionMessage, setVersionMessage] = useState<string | null>(null);

  const [replyDraft, setReplyDraft] = useState("");
  const [replying, setReplying] = useState(false);

  const [historyOpen, setHistoryOpen] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [pendingExport, setPendingExport] = useState<"markdown" | "html" | "pdf" | null>(null);
  const [viewingRevision, setViewingRevision] = useState<NoteRevision | null>(null);

  const resolveAuthor = useTeamRoster(note?.team_id ?? null);
  const canEditReply = (reply: Note) => Boolean(user) && (user!.id === reply.created_by || isAdmin(token));

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    setViewingRevision(null);
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

  // Browsers derive the default filename in "Print / save as PDF" from the
  // document's <title> at the moment window.print() is called -- without
  // this, every note's PDF would suggest the same generic "Tack" filename.
  // Reset on unmount so navigating elsewhere doesn't leave a stale title.
  useEffect(() => {
    if (!note) return;
    const previous = document.title;
    document.title = note.title || previous;
    return () => {
      document.title = previous;
    };
  }, [note?.title]);

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

  // Folders are only ever relevant to a top-level note (replies can't be
  // filed -- server-enforced, see tack-server's notes_folder_id_top_level_only
  // CHECK constraint), and only once the note's own team is known.
  useEffect(() => {
    if (!token || !note?.team_id) {
      setFolders(null);
      return;
    }
    let cancelled = false;
    listNoteFolders(token, note.team_id)
      .then((f) => {
        if (!cancelled) setFolders(f);
      })
      .catch(() => {
        /* Non-fatal: the folder selector just won't offer choices. */
      });
    return () => {
      cancelled = true;
    };
  }, [token, note?.team_id]);

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

  /** `next` is a folder id, or `"unfiled"` (the select's sentinel option for
   * `null`, since `<option>` values are always strings). Broadcasts the
   * change over the same pub/sub NoteThread already uses for title edits,
   * so NotesList drops the note if it's moved out of the folder currently
   * being viewed, and NoteFolderList refreshes its note_count badges. */
  async function saveFolder(next: string) {
    if (!token || !note) return;
    const folderId = next === "unfiled" ? null : next;
    if (folderId === note.folder_id) return;
    setFolderSaving(true);
    try {
      const updated = await updateNote(token, note.id, { folder_id: folderId });
      setNote(updated);
      notifyNoteUpdated(updated.id, { folder_id: updated.folder_id });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setFolderSaving(false);
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

  async function deleteThisNote() {
    if (!token || !note) return;
    await deleteNote(token, note.id);
    notifyNoteDeleted(note.id);
    router.push("/notes");
  }

  if (error) return <p className="p-6 text-red-600">{error}</p>;
  if (!note) return <p className="p-6 text-slate-400">{t("loading")}</p>;

  const latestRevision = revisions?.[0] ?? null;
  const editedSinceLastVersion = latestRevision !== null && latestRevision.body_markdown !== note.body_markdown;

  function handleSelectVersion(revision: NoteRevision) {
    setViewingRevision(revision.version === latestRevision?.version ? null : revision);
  }

  // While viewingRevision is set, the main panel shows that snapshot (and
  // its own scoped replies) instead of the live current state -- otherwise
  // both show "current". A reply with no recorded version (created before
  // `in_reply_to_version` existed) is treated as always-current, matching
  // its old always-visible behavior.
  const displayedVersion = viewingRevision?.version ?? latestRevision?.version ?? null;
  const displayedBody = viewingRevision ? viewingRevision.body_markdown : note.body_markdown;
  const displayedReplies = replies.filter(
    (r) => r.in_reply_to_version === displayedVersion || (r.in_reply_to_version === null && !viewingRevision)
  );
  const olderReplies = viewingRevision
    ? []
    : replies.filter((r) => r.in_reply_to_version !== null && r.in_reply_to_version !== displayedVersion);

  // Export always reflects whatever's currently on screen -- the displayed
  // (possibly historical) body and that version's own replies, not
  // necessarily the live current state, matching what the user is actually
  // looking at when they click one of these. Exporting a non-latest version
  // requires an explicit confirm first (see `pendingExport`/
  // `ConfirmExportOldVersionModal`), and the export itself is stamped with
  // a superseded-version warning so it can't be mistaken for current.
  const exportTitle = note.title || "Untitled note";

  function runExportMarkdown() {
    const lines = [`# ${exportTitle}`];
    if (viewingRevision) lines.push("", t("supersededStampMarkdown", { n: viewingRevision.version }));
    lines.push("", displayedBody);
    if (displayedReplies.length) {
      lines.push("", "---", "", "## Replies", "");
      for (const r of displayedReplies) {
        lines.push(`### ${resolveAuthor(r.created_by)} — ${new Date(r.created_at).toLocaleString()}`, "", r.body_markdown, "");
      }
    }
    downloadFile(`${slugify(exportTitle)}.md`, lines.join("\n"), "text/markdown");
  }

  function runExportHtml() {
    let bodyHtml = `<h1>${escapeHtml(exportTitle)}</h1>`;
    if (viewingRevision) {
      bodyHtml += `<p style="border:2px solid #b45309;background:#fffbeb;color:#92400e;font-weight:600;padding:0.5rem 0.75rem;border-radius:0.5rem;">${escapeHtml(t("supersededStampHtml", { n: viewingRevision.version }))}</p>`;
    }
    bodyHtml += markdownToHtml(displayedBody);
    if (displayedReplies.length) {
      bodyHtml += `<hr/><h2>Replies</h2>`;
      for (const r of displayedReplies) {
        bodyHtml += `<p class="meta">${escapeHtml(resolveAuthor(r.created_by))} — ${new Date(r.created_at).toLocaleString()}</p>${markdownToHtml(r.body_markdown)}`;
      }
    }
    downloadFile(`${slugify(exportTitle)}.html`, wrapHtmlDocument(exportTitle, bodyHtml), "text/html");
  }

  function runExportPdf() {
    window.print();
  }

  function exportMarkdown() {
    if (viewingRevision) setPendingExport("markdown");
    else runExportMarkdown();
  }

  function exportHtml() {
    if (viewingRevision) setPendingExport("html");
    else runExportHtml();
  }

  function exportPdf() {
    if (viewingRevision) setPendingExport("pdf");
    else runExportPdf();
  }

  function confirmPendingExport() {
    if (pendingExport === "markdown") runExportMarkdown();
    else if (pendingExport === "html") runExportHtml();
    else if (pendingExport === "pdf") runExportPdf();
    setPendingExport(null);
  }

  return (
    <div className="p-6 max-w-3xl space-y-6">
      <div className="flex items-center gap-3">
        {canEdit && !viewingRevision ? (
          <>
            <input
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
              onBlur={saveTitle}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.currentTarget.blur();
              }}
              disabled={titleSaving}
              placeholder={t("titlePlaceholder")}
              className="print:hidden text-xl font-semibold text-slate-800 flex-1 min-w-0 rounded px-1 -mx-1 focus:outline-none focus:ring-1 focus:ring-rose-400"
            />
            {/* An <input> prints as a form control, not readable text -- this
                is what actually shows up in the PDF/print output instead. */}
            <h1 className="hidden print:block text-xl font-semibold text-slate-800 flex-1 min-w-0">{note.title}</h1>
          </>
        ) : (
          <h1 className="text-xl font-semibold text-slate-800 flex-1 min-w-0 truncate">{note.title}</h1>
        )}
      </div>

      <div className="flex items-center gap-2">
        {canEdit && !viewingRevision ? (
          <>
            <select
              value={note.visibility}
              onChange={(e) => saveVisibility(e.target.value as Visibility)}
              disabled={visibilitySaving}
              className="print:hidden text-xs px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500 border-none focus:outline-none focus:ring-1 focus:ring-rose-400 disabled:opacity-50"
            >
              <option value="private">{t("visibility.private")}</option>
              <option value="team">{t("visibility.team")}</option>
              <option value="organization">{t("visibility.organization")}</option>
            </select>
            <span className="hidden print:inline-block text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">
              {t(`visibility.${note.visibility}`)}
            </span>
          </>
        ) : (
          <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">
            {t(`visibility.${note.visibility}`)}
          </span>
        )}
        {/* Folder assignment: only a top-level note can be filed (a reply's
            folder_id is server-rejected), and only once its team's folders
            have loaded -- print:hidden since a folder is a browse-time
            organizational detail, not part of the note's own content. */}
        {!note.parent_id && canEdit && !viewingRevision && folders && (
          <select
            value={note.folder_id ?? "unfiled"}
            onChange={(e) => saveFolder(e.target.value)}
            disabled={folderSaving}
            className="print:hidden text-xs px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500 border-none focus:outline-none focus:ring-1 focus:ring-rose-400 disabled:opacity-50"
          >
            <option value="unfiled">{t("folderUnfiled")}</option>
            {folders.map((folder) => (
              <option key={folder.id} value={folder.id}>
                {folder.name}
              </option>
            ))}
          </select>
        )}
        {/* Only rendered once the folder's name is actually known -- a
            failed/forbidden folders fetch (e.g. an admin who isn't a member
            of this note's own team) must not show a genuinely-filed note as
            "Unfiled", which is the wrong label, not just a missing one. */}
        {!note.parent_id && note.folder_id && (!canEdit || viewingRevision) && folders?.find((f) => f.id === note.folder_id) && (
          <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">
            {folders.find((f) => f.id === note.folder_id)!.name}
          </span>
        )}
        <span className="text-xs text-slate-400">
          {t("editedBy", { name: resolveAuthor(note.created_by) })} · {new Date(note.created_at).toLocaleString()}
        </span>
        <div className="flex-1" />
        {latestRevision && !viewingRevision && (
          <span className="text-xs text-slate-400">
            {t("version", { n: latestRevision.version })}
            {editedSinceLastVersion && ` · ${t("editedSinceSave")}`}
          </span>
        )}
        <IconButton title={t("versionHistory")} onClick={() => setHistoryOpen(true)}>
          {historyIcon}
        </IconButton>
        {canEdit && !viewingRevision && (
          <IconButton title={t("createVersion")} onClick={saveAsVersion} disabled={creatingVersion}>
            {saveVersionIcon}
          </IconButton>
        )}
        {canEdit && !editing && !viewingRevision && (
          <IconButton title={t("edit")} onClick={() => setEditing(true)}>
            {editIcon}
          </IconButton>
        )}
        {canEdit && !viewingRevision && (
          <IconButton title={t("deleteNote")} onClick={() => setDeleteModalOpen(true)} danger>
            {deleteIcon}
          </IconButton>
        )}
        <div className="w-px h-4 bg-slate-200 print:hidden" />
        <IconButton title={t("exportMarkdown")} onClick={exportMarkdown}>
          {downloadMarkdownIcon}
        </IconButton>
        <IconButton title={t("exportHtml")} onClick={exportHtml}>
          {downloadHtmlIcon}
        </IconButton>
        <IconButton title={t("exportPdf")} onClick={exportPdf}>
          {printIcon}
        </IconButton>
      </div>

      {viewingRevision && (
        // print:border-2 (not just the screen border-1) + font-semibold so
        // the stamp stays legible in print even if the browser has
        // "print background colors" off (bg-amber-50 alone wouldn't survive
        // that) -- this is what makes the exported PDF unmistakably marked
        // as a superseded version.
        <div className="flex items-center justify-between gap-2 rounded-lg border border-amber-300 print:border-2 print:border-amber-700 bg-amber-50 px-3 py-2 text-xs text-amber-800 print:font-semibold">
          <span>{t("viewingOldVersion", { n: viewingRevision.version })}</span>
          <button
            type="button"
            onClick={() => setViewingRevision(null)}
            className="font-medium underline hover:no-underline shrink-0 print:hidden"
          >
            {t("showLatest")}
          </button>
        </div>
      )}

      {versionMessage && <p className="text-xs text-green-700 print:hidden">{versionMessage}</p>}

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
        <div className={viewingRevision ? "rounded-lg bg-amber-50/50 border border-amber-100 p-3" : undefined}>
          <NoteMarkdown body={displayedBody} />
        </div>
      )}

      {displayedReplies.length > 0 && (
        <div className="border-t border-slate-200 pt-4 space-y-4">
          {displayedReplies.map((reply) => (
            <ReplyItem
              key={reply.id}
              reply={reply}
              authorName={resolveAuthor(reply.created_by)}
              canEdit={!viewingRevision && canEditReply(reply)}
              onSave={(body) => saveReplyEdit(reply.id, body)}
              onDelete={() => deleteReply(reply.id)}
              onCreateVersion={() => saveReplyVersion(reply.id)}
            />
          ))}
        </div>
      )}

      {olderReplies.length > 0 && (
        <button
          type="button"
          onClick={() => setHistoryOpen(true)}
          className="block text-xs text-slate-400 hover:text-rose-700 print:hidden"
        >
          {t("olderReplies", { count: olderReplies.length })}
        </button>
      )}

      {!viewingRevision && (
        <div className="border-t border-slate-200 pt-4 space-y-2 print:hidden">
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
      )}

      {historyOpen && (
        <VersionHistory
          noteId={note.id}
          title={note.title}
          canEdit={canEdit}
          replies={replies}
          onRevisionsChanged={setRevisions}
          onRepliesChanged={setReplies}
          onSelectVersion={handleSelectVersion}
          onClose={() => setHistoryOpen(false)}
        />
      )}

      {deleteModalOpen && (
        <DeleteNoteModal onConfirm={deleteThisNote} onCancel={() => setDeleteModalOpen(false)} />
      )}

      {pendingExport && viewingRevision && (
        <ConfirmExportOldVersionModal
          version={viewingRevision.version}
          onConfirm={confirmPendingExport}
          onCancel={() => setPendingExport(null)}
        />
      )}
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

      {historyOpen && <VersionHistory noteId={reply.id} canEdit={canEdit} onClose={() => setHistoryOpen(false)} />}
    </div>
  );
}
