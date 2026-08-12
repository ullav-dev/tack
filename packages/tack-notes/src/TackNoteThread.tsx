"use client";

import { useEffect, useState, type ComponentType } from "react";
import { useNoteEvents } from "./NoteEventsContext";
import type { Note, NoteFolder, NoteRevision, TackNotesApi, Visibility } from "./api";
import NoteMarkdown, { markdownToHtml } from "./NoteMarkdown";
import MarkdownComposer from "./MarkdownComposer";
import VersionHistory from "./VersionHistory";
import DeleteNoteModal from "./DeleteNoteModal";
import ConfirmExportOldVersionModal from "./ConfirmExportOldVersionModal";
import { downloadFile, escapeHtml, slugify, wrapHtmlDocument } from "./export";
import { Icon, IconButton, editIcon, deleteIcon } from "./Icon";
import type { TFunction } from "./types";

export interface TackNoteThreadProps {
  noteId: string;
  api: TackNotesApi;
  /** The signed-in caller's own user id -- used for the client-side
   * creator-or-admin `canEdit` check (`notes_acl.rs`'s exact rule, mirrored
   * here for UI purposes only; the backend still enforces it
   * authoritatively on every PATCH/reply/delete). */
  currentUserId: string;
  isAdmin: boolean;
  /** Turns a `created_by` UUID into a display name -- `teamId` is the
   * note's own `team_id` (only known once the note has loaded, which is why
   * this isn't a plain `(userId) => string` the host app can pre-resolve
   * once up front). The optional third argument is the specific note or
   * reply being displayed (never the top-level note when resolving a
   * reply's own author) -- lets a host app derive an author from the
   * note's own content when `created_by` alone isn't enough (e.g. cunav's
   * inbound-email notes, attributed to a fixed service account but with
   * the real reporter's name embedded in the body). How you resolve this
   * (team roster, system-principal lookup, note content, or a mix) is
   * entirely up to the host app. */
  resolveAuthor: (userId: string, teamId: string | null, note?: Note) => string;
  /** Calls `t("notes")` namespace keys -- see this package's README for the
   * full list. */
  t: TFunction;
  /** Called after the note itself is deleted, in place of a router push --
   * the host app decides where "back to the notes list" means. */
  onNavigateAfterDelete: () => void;
  ImagePicker?: ComponentType<{ onSelect: (asset: { url: string; name: string }) => void; onClose: () => void }>;
  /** Overrides the folder choices offered in the folder selector, instead
   * of self-fetching `api.listNoteFolders(note.team_id)` (tack's own
   * team-wide folder list). `TackNotesPanel` passes its own entity-scoped
   * folder list here, since a team-wide fetch wouldn't include those at
   * all. Leave unset for the default self-fetch behavior. */
  folders?: NoteFolder[];
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

/** A Note's own title/visibility/body/edit UI, and its full reply thread --
 * extracted from `tack`'s own `NoteThread.tsx`. Every tack-specific
 * dependency (auth, routing, roster, the API base, next-intl) is now a
 * prop; see `TackNoteThreadProps` and this package's README. The full
 * behavioral doc comment (version history, viewing an old version, export)
 * lives in `tack`'s git history / the original file -- unchanged here,
 * just re-homed. */
export default function TackNoteThread({
  noteId,
  api,
  currentUserId,
  isAdmin,
  resolveAuthor,
  t,
  onNavigateAfterDelete,
  ImagePicker,
  folders: foldersOverride,
}: TackNoteThreadProps) {
  const { notifyNoteUpdated, notifyNoteDeleted, subscribeRefresh } = useNoteEvents();

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

  const canEditReply = (reply: Note) => currentUserId === reply.created_by || isAdmin;

  useEffect(() => {
    let cancelled = false;
    setViewingRevision(null);
    Promise.all([api.getNote(noteId), api.listReplies(noteId), api.listRevisions(noteId)])
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noteId]);

  // Browsers derive the default filename in "Print / save as PDF" from the
  // document's <title> at the moment window.print() is called.
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
      try {
        const [n, r, rv] = await Promise.all([api.getNote(noteId), api.listReplies(noteId), api.listRevisions(noteId)]);
        setNote(n);
        if (!editing) setTitleDraft(n.title);
        if (!editing) setBodyDraft(n.body_markdown);
        setReplies(r);
        setRevisions(rv);
      } catch (e) {
        setError((e as Error).message);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subscribeRefresh, noteId, editing]);

  // Folders are only ever relevant to a top-level note (replies can't be
  // filed -- server-enforced), and only once the note's own team is known.
  // Skipped entirely when `foldersOverride` is given (TackNotesPanel's own
  // entity-scoped folder list) -- a team-wide fetch wouldn't include those
  // folders at all, so there's nothing to self-fetch in that mode.
  useEffect(() => {
    if (foldersOverride !== undefined) {
      setFolders(foldersOverride);
      return;
    }
    if (!note?.team_id) {
      setFolders(null);
      return;
    }
    let cancelled = false;
    // This selector needs the *whole* list to choose from -- 100 is
    // GET /note-folders' own max limit.
    api
      .listNoteFolders(note.team_id, { limit: 100 })
      .then((result) => {
        if (!cancelled) setFolders(result.folders);
      })
      .catch(() => {
        /* Non-fatal: the folder selector just won't offer choices. */
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [note?.team_id, foldersOverride]);

  const canEdit = currentUserId === note?.created_by || isAdmin;

  async function saveTitle() {
    if (!note || !titleDraft.trim() || titleDraft === note.title) return;
    setTitleSaving(true);
    try {
      const updated = await api.updateNote(note.id, { title: titleDraft.trim() });
      setNote(updated);
      notifyNoteUpdated(updated.id, { title: updated.title });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setTitleSaving(false);
    }
  }

  async function saveVisibility(next: Visibility) {
    if (!note || next === note.visibility) return;
    setVisibilitySaving(true);
    try {
      const updated = await api.updateNote(note.id, { visibility: next });
      setNote(updated);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setVisibilitySaving(false);
    }
  }

  async function saveFolder(next: string) {
    if (!note) return;
    const folderId = next === "unfiled" ? null : next;
    if (folderId === note.folder_id) return;
    setFolderSaving(true);
    try {
      const updated = await api.updateNote(note.id, { folder_id: folderId });
      setNote(updated);
      notifyNoteUpdated(updated.id, { folder_id: updated.folder_id });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setFolderSaving(false);
    }
  }

  async function saveEdit() {
    if (!note || !bodyDraft.trim()) return;
    setSaving(true);
    try {
      const updated = await api.updateNote(note.id, { body_markdown: bodyDraft.trim() });
      setNote(updated);
      setEditing(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function saveAsVersion() {
    if (!note) return;
    setCreatingVersion(true);
    setVersionMessage(null);
    try {
      const revision = await api.createRevision(note.id);
      setRevisions((prev) => [revision, ...(prev ?? [])]);
      setVersionMessage(t("versionCreated"));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCreatingVersion(false);
    }
  }

  async function submitReply() {
    if (!note || !replyDraft.trim()) return;
    setReplying(true);
    try {
      const reply = await api.createReply(note.id, replyDraft.trim());
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
    const updated = await api.updateNote(replyId, { body_markdown: body.trim() });
    setReplies((prev) => prev.map((r) => (r.id === replyId ? updated : r)));
  }

  async function deleteReply(replyId: string) {
    await api.deleteNote(replyId);
    setReplies((prev) => prev.filter((r) => r.id !== replyId));
    setNote((prev) => (prev ? { ...prev, reply_count: Math.max(0, prev.reply_count - 1) } : prev));
  }

  async function saveReplyVersion(replyId: string) {
    await api.createRevision(replyId);
  }

  async function deleteThisNote() {
    if (!note) return;
    await api.deleteNote(note.id);
    notifyNoteDeleted(note.id);
    onNavigateAfterDelete();
  }

  if (error) return <p className="p-6 text-red-600">{error}</p>;
  if (!note) return <p className="p-6 text-slate-400">{t("loading")}</p>;

  const latestRevision = revisions?.[0] ?? null;
  const editedSinceLastVersion = latestRevision !== null && latestRevision.body_markdown !== note.body_markdown;

  function handleSelectVersion(revision: NoteRevision) {
    setViewingRevision(revision.version === latestRevision?.version ? null : revision);
  }

  const displayedVersion = viewingRevision?.version ?? latestRevision?.version ?? null;
  const displayedBody = viewingRevision ? viewingRevision.body_markdown : note.body_markdown;
  const displayedReplies = replies.filter(
    (r) => r.in_reply_to_version === displayedVersion || (r.in_reply_to_version === null && !viewingRevision)
  );
  const olderReplies = viewingRevision
    ? []
    : replies.filter((r) => r.in_reply_to_version !== null && r.in_reply_to_version !== displayedVersion);

  const exportTitle = note.title || "Untitled note";
  // Captured as a local so the nested export functions below don't each
  // re-access `note` themselves -- TS can't carry the `if (!note) return`
  // narrowing above into a nested function declaration (the closure could
  // in principle run later, after `note` changed), even though in practice
  // these are only ever invoked during this same render.
  const noteTeamId = note.team_id;

  function runExportMarkdown() {
    const lines = [`# ${exportTitle}`];
    if (viewingRevision) lines.push("", t("supersededStampMarkdown", { n: viewingRevision.version }));
    lines.push("", displayedBody);
    if (displayedReplies.length) {
      lines.push("", "---", "", "## Replies", "");
      for (const r of displayedReplies) {
        lines.push(`### ${resolveAuthor(r.created_by, noteTeamId, r)} — ${new Date(r.created_at).toLocaleString()}`, "", r.body_markdown, "");
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
        bodyHtml += `<p class="meta">${escapeHtml(resolveAuthor(r.created_by, noteTeamId, r))} — ${new Date(r.created_at).toLocaleString()}</p>${markdownToHtml(r.body_markdown)}`;
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
    <div className="p-6 max-w-3xl min-w-0 space-y-6">
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
              className="print:hidden text-xl font-semibold text-slate-800 flex-1 min-w-0 rounded px-1 -mx-1 focus:outline-none focus:ring-1 focus:ring-[var(--tnotes-400,#fb7185)]"
            />
            <h1 className="hidden print:block text-xl font-semibold text-slate-800 flex-1 min-w-0">{note.title}</h1>
          </>
        ) : (
          <h1 className="text-xl font-semibold text-slate-800 flex-1 min-w-0 truncate">{note.title}</h1>
        )}
      </div>

      {/* Three independent wrap groups, not one long non-wrapping row --
          this pane is as often a narrow embedded panel (Cunav, Togra) as it
          is full browser width, and badges/byline/icon-actions all have
          very different natural widths. Badges wrap among themselves; the
          byline sits on its own line (never sharing a line with buttons,
          so it can't get squeezed to nothing); actions wrap and stay
          right-aligned when there's room, drop to icon rows when there
          isn't. */}
      <div className="space-y-1.5">
        <div className="flex flex-wrap items-center gap-2">
          {canEdit && !viewingRevision ? (
            <>
              <select
                value={note.visibility}
                onChange={(e) => saveVisibility(e.target.value as Visibility)}
                disabled={visibilitySaving}
                className="print:hidden text-xs px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500 border-none focus:outline-none focus:ring-1 focus:ring-[var(--tnotes-400,#fb7185)] disabled:opacity-50"
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
            <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">{t(`visibility.${note.visibility}`)}</span>
          )}
          {!note.parent_id && canEdit && !viewingRevision && folders && (
            <select
              value={note.folder_id ?? "unfiled"}
              onChange={(e) => saveFolder(e.target.value)}
              disabled={folderSaving}
              className="print:hidden text-xs px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500 border-none focus:outline-none focus:ring-1 focus:ring-[var(--tnotes-400,#fb7185)] disabled:opacity-50"
            >
              <option value="unfiled">{t("folderUnfiled")}</option>
              {folders.map((folder) => (
                <option key={folder.id} value={folder.id}>
                  {folder.name}
                </option>
              ))}
            </select>
          )}
          {!note.parent_id && note.folder_id && (!canEdit || viewingRevision) && folders?.find((f) => f.id === note.folder_id) && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">
              {folders.find((f) => f.id === note.folder_id)!.name}
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-xs text-slate-400">
          <span className="whitespace-nowrap">
            {t("editedBy", { name: resolveAuthor(note.created_by, note.team_id, note) })} · {new Date(note.created_at).toLocaleString()}
          </span>
          {latestRevision && !viewingRevision && (
            <span className="whitespace-nowrap">
              {t("version", { n: latestRevision.version })}
              {editedSinceLastVersion && ` · ${t("editedSinceSave")}`}
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-1">
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
      </div>

      {viewingRevision && (
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
          <MarkdownComposer value={bodyDraft} onChange={setBodyDraft} disabled={saving} rows={8} t={t} ImagePicker={ImagePicker} />
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
              className="text-xs bg-[var(--tnotes-700,#be123c)] hover:bg-[var(--tnotes-800,#9f1239)] disabled:opacity-50 text-white px-3 py-1 rounded"
            >
              {saving ? t("saving") : t("save")}
            </button>
          </div>
        </div>
      ) : (
        <div className={`min-w-0 overflow-x-auto ${viewingRevision ? "rounded-lg bg-amber-50/50 border border-amber-100 p-3" : ""}`}>
          <NoteMarkdown body={displayedBody} />
        </div>
      )}

      {displayedReplies.length > 0 && (
        <div className="border-t border-slate-200 pt-4 space-y-4">
          {displayedReplies.map((reply) => (
            <ReplyItem
              key={reply.id}
              reply={reply}
              authorName={resolveAuthor(reply.created_by, note.team_id, reply)}
              canEdit={!viewingRevision && canEditReply(reply)}
              onSave={(body) => saveReplyEdit(reply.id, body)}
              onDelete={() => deleteReply(reply.id)}
              onCreateVersion={() => saveReplyVersion(reply.id)}
              api={api}
              t={t}
              ImagePicker={ImagePicker}
            />
          ))}
        </div>
      )}

      {olderReplies.length > 0 && (
        <button
          type="button"
          onClick={() => setHistoryOpen(true)}
          className="block text-xs text-slate-400 hover:text-[var(--tnotes-700,#be123c)] print:hidden"
        >
          {t("olderReplies", { count: olderReplies.length })}
        </button>
      )}

      {!viewingRevision && (
        <div className="border-t border-slate-200 pt-4 space-y-2 print:hidden">
          <MarkdownComposer value={replyDraft} onChange={setReplyDraft} placeholder={t("replyPlaceholder")} disabled={replying} rows={3} t={t} ImagePicker={ImagePicker} />
          <div className="flex justify-end">
            <button
              type="button"
              onClick={submitReply}
              disabled={replying || !replyDraft.trim()}
              className="text-xs bg-[var(--tnotes-700,#be123c)] hover:bg-[var(--tnotes-800,#9f1239)] disabled:opacity-50 text-white px-3 py-1 rounded"
            >
              {replying ? t("saving") : t("reply")}
            </button>
          </div>
        </div>
      )}

      {historyOpen && (
        <VersionHistory
          api={api}
          noteId={note.id}
          title={note.title}
          canEdit={canEdit}
          replies={replies}
          onRevisionsChanged={setRevisions}
          onRepliesChanged={setReplies}
          onSelectVersion={handleSelectVersion}
          onClose={() => setHistoryOpen(false)}
          t={t}
        />
      )}

      {deleteModalOpen && <DeleteNoteModal onConfirm={deleteThisNote} onCancel={() => setDeleteModalOpen(false)} t={t} />}

      {pendingExport && viewingRevision && (
        <ConfirmExportOldVersionModal version={viewingRevision.version} onConfirm={confirmPendingExport} onCancel={() => setPendingExport(null)} t={t} />
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
  api: TackNotesApi;
  t: TFunction;
  ImagePicker?: ComponentType<{ onSelect: (asset: { url: string; name: string }) => void; onClose: () => void }>;
}

/** One reply's own view/edit/delete/version UI -- extracted verbatim from
 * `tack`'s own `NoteThread.tsx`'s `ReplyItem`. */
function ReplyItem({ reply, authorName, canEdit, onSave, onDelete, onCreateVersion, api, t, ImagePicker }: ReplyItemProps) {
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
    <div className="pl-4 border-l-2 border-slate-200 min-w-0">
      {/* Byline on its own line, actions on theirs -- the indent already
          eats width here, so packing both into one non-wrapping row is
          exactly what breaks first in a narrow embedded panel. */}
      <div className="space-y-1">
        <span className="block text-xs text-slate-400 whitespace-nowrap overflow-hidden text-ellipsis">
          {authorName} · {new Date(reply.created_at).toLocaleString()}
        </span>
        <div className="flex flex-wrap items-center gap-1">
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
              <button type="button" onClick={() => setConfirmingDelete(false)} disabled={deleting} className="text-xs text-slate-400 hover:text-slate-600">
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
      </div>

      {error && <p className="text-xs text-red-600">{error}</p>}
      {versionMessage && <p className="text-xs text-green-700">{versionMessage}</p>}

      {editing ? (
        <div className="space-y-2 mt-1">
          <MarkdownComposer value={draft} onChange={setDraft} disabled={saving} rows={3} t={t} ImagePicker={ImagePicker} />
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
              className="text-xs bg-[var(--tnotes-700,#be123c)] hover:bg-[var(--tnotes-800,#9f1239)] disabled:opacity-50 text-white px-3 py-1 rounded"
            >
              {saving ? t("saving") : t("save")}
            </button>
          </div>
        </div>
      ) : (
        <div className="min-w-0 overflow-x-auto">
          <NoteMarkdown body={reply.body_markdown} />
        </div>
      )}

      {historyOpen && <VersionHistory api={api} noteId={reply.id} canEdit={canEdit} onClose={() => setHistoryOpen(false)} t={t} />}
    </div>
  );
}
