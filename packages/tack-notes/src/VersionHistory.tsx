"use client";

import { useEffect, useState } from "react";
import type { Note, NoteRevision, TackNotesApi } from "./api";
import NoteMarkdown from "./NoteMarkdown";
import ResizableSplit from "./ResizableSplit";
import type { TFunction } from "./types";

interface Props {
  api: TackNotesApi;
  noteId: string;
  /** The note's (or reply's) own title, shown in the header. Empty/omitted
   * for a reply, which never has its own title. */
  title?: string;
  canEdit: boolean;
  /** The note's own replies, if any -- passed down so each version can show
   * only the replies that were made while it was current. Omitted for a
   * reply's own history drawer. */
  replies?: Note[];
  onClose: () => void;
  onRevisionsChanged?: (revisions: NoteRevision[]) => void;
  onRepliesChanged?: (replies: Note[]) => void;
  onSelectVersion?: (revision: NoteRevision) => void;
  /** Calls `t("versionHistory")`, `t("close")`, `t("loading")`,
   * `t("version", { n })`, `t("delete")`, `t("deleteVersionConfirm")`,
   * `t("deleteCancel")`, `t("saving")`, `t("viewThisVersion")`,
   * `t("noVersions")`. */
  t: TFunction;
}

function Icon({ children }: { children: React.ReactNode }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" className="w-3.5 h-3.5">
      {children}
    </svg>
  );
}

const deleteIcon = (
  <Icon>
    <path d="M3 4.5h10M6 4.5V3a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v1.5" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M4.5 4.5 5 13a1 1 0 0 0 1 1h4a1 1 0 0 0 1-1l.5-8.5" strokeLinecap="round" strokeLinejoin="round" />
  </Icon>
);

/** Revision history drawer for a Note -- extracted from `tack`'s own
 * `VersionHistory.tsx`, decoupled from `useAuth`/`tack-server-api` (takes
 * `api` instead) and `next-intl` (takes `t` instead). */
export default function VersionHistory({ api, noteId, title, canEdit, replies, onClose, onRevisionsChanged, onRepliesChanged, onSelectVersion, t }: Props) {
  const [revisions, setRevisions] = useState<NoteRevision[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<NoteRevision | null>(null);
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api
      .listRevisions(noteId)
      .then((r) => {
        if (cancelled) return;
        setRevisions(r);
        setSelected(r[0] ?? null);
      })
      .catch((e) => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noteId]);

  async function handleDelete(revisionId: string) {
    setDeleting(true);
    try {
      await api.deleteRevision(noteId, revisionId);
      const next = (revisions ?? []).filter((r) => r.id !== revisionId);
      setRevisions(next);
      onRevisionsChanged?.(next);
      if (selected?.id === revisionId) setSelected(next[0] ?? null);
      setConfirmingDeleteId(null);
      if (replies) {
        const updatedReplies = await api.listReplies(noteId);
        onRepliesChanged?.(updatedReplies);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setDeleting(false);
    }
  }

  const latestVersion = revisions?.[0]?.version ?? null;
  const selectedReplies = selected
    ? (replies ?? []).filter((r) =>
        r.in_reply_to_version === selected.version || (r.in_reply_to_version === null && selected.version === latestVersion)
      )
    : [];

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/20 print:hidden" onClick={onClose}>
      <div className="w-full max-w-[90vw] h-full bg-white shadow-xl flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 shrink-0">
          <div className="min-w-0">
            <h2 className="font-semibold text-slate-800">{t("versionHistory")}</h2>
            {title && <p className="text-xs text-slate-400 truncate">{title}</p>}
          </div>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600 text-sm shrink-0">
            {t("close")}
          </button>
        </div>
        <div className="flex-1 min-h-0">
          {error && <p className="px-3 py-2 text-xs text-red-600">{error}</p>}
          {!revisions && !error && <p className="px-3 py-2 text-xs text-slate-400">{t("loading")}</p>}
          {revisions && (
            <ResizableSplit
              storageKey="tack_version_history_split"
              defaultWidth={160}
              minWidth={120}
              maxWidth={Infinity}
              left={
                <div className="border-r border-slate-200 h-full py-2">
                  {revisions.map((rev) => (
                    <div key={rev.id} className={`flex items-center gap-1 px-2 ${selected?.id === rev.id ? "bg-[var(--tnotes-50,#fff1f2)]" : ""}`}>
                      <button
                        type="button"
                        onClick={() => setSelected(rev)}
                        className={`flex-1 min-w-0 text-left px-1 py-1.5 text-xs ${
                          selected?.id === rev.id ? "text-[var(--tnotes-700,#be123c)] font-medium" : "text-slate-600 hover:bg-slate-50"
                        }`}
                      >
                        {t("version", { n: rev.version })}
                        <br />
                        <span className="text-slate-400">{new Date(rev.edited_at).toLocaleString()}</span>
                      </button>
                      {canEdit && revisions.length > 1 && (
                        <button
                          type="button"
                          title={t("delete")}
                          aria-label={t("delete")}
                          onClick={() => setConfirmingDeleteId(rev.id)}
                          className="w-5 h-5 shrink-0 rounded flex items-center justify-center text-slate-300 hover:text-red-600 hover:bg-red-50"
                        >
                          {deleteIcon}
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              }
              right={
                <div className="p-4 space-y-4">
                  {confirmingDeleteId && (
                    <div className="flex items-center gap-2 text-xs bg-red-50 text-red-700 rounded px-3 py-2">
                      <span>{t("deleteVersionConfirm")}</span>
                      <button
                        type="button"
                        onClick={() => setConfirmingDeleteId(null)}
                        disabled={deleting}
                        className="text-slate-500 hover:text-slate-700"
                      >
                        {t("deleteCancel")}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(confirmingDeleteId)}
                        disabled={deleting}
                        className="font-medium text-red-700 hover:text-red-900 disabled:opacity-50"
                      >
                        {deleting ? t("saving") : t("delete")}
                      </button>
                    </div>
                  )}
                  {selected ? (
                    <>
                      {onSelectVersion && (
                        <button
                          type="button"
                          onClick={() => {
                            onSelectVersion(selected);
                            onClose();
                          }}
                          className="text-xs font-medium text-[var(--tnotes-700,#be123c)] hover:text-[var(--tnotes-900,#881337)] border border-[var(--tnotes-200,#fecdd3)] hover:border-[var(--tnotes-300,#fda4af)] rounded px-2 py-1"
                        >
                          {t("viewThisVersion")}
                        </button>
                      )}
                      <NoteMarkdown body={selected.body_markdown} />
                      {selectedReplies.length > 0 && (
                        <div className="border-t border-slate-200 pt-3 space-y-3">
                          {selectedReplies.map((reply) => (
                            <div key={reply.id} className="pl-3 border-l-2 border-slate-200">
                              <span className="text-xs text-slate-400">{new Date(reply.created_at).toLocaleString()}</span>
                              <NoteMarkdown body={reply.body_markdown} />
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  ) : (
                    <p className="text-sm text-slate-400">{t("noVersions")}</p>
                  )}
                </div>
              }
            />
          )}
        </div>
      </div>
    </div>
  );
}
