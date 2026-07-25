"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useAuth } from "@/contexts/AuthContext";
import { deletePageRevision, listPageRevisions, type PageRevision } from "@/lib/tack-server-api";
import NoteMarkdown from "@/components/NoteMarkdown";
import ResizableSplit from "@/components/ResizableSplit";

interface Props {
  pageId: string;
  /** The page's own title, shown in the header so it's clear which page's
   * history this is. */
  title: string;
  canEdit: boolean;
  onClose: () => void;
  /** Lets the parent (which fetches its own copy of `revisions` for the
   * "Version N" badge) stay in sync when a version is deleted in here,
   * without a full refetch. */
  onRevisionsChanged?: (revisions: PageRevision[]) => void;
  /** Makes the selected version the one shown in the main editor view
   * (read-only, in place of the live collaborative editor) instead of the
   * live current state. */
  onSelectVersion?: (revision: PageRevision) => void;
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

/** Revision history drawer for a Page -- same shape/behavior as `VersionHistory`
 * (Notes' equivalent), minus the replies-per-version feature (Pages have no
 * replies of their own; comments on a page are Notes attached to it, a
 * separate content type). Unlike Notes, a page has no automatic baseline
 * revision at creation time, so the list can legitimately be empty and
 * there's no "can't delete the last remaining version" restriction to
 * surface here -- the delete icon is always available (when `canEdit`),
 * not gated on `revisions.length > 1`.
 *
 * The list/content split uses the same `ResizableSplit` as `VersionHistory`,
 * with `maxWidth={Infinity}` for a genuinely unbounded drag. */
export default function PageVersionHistory({ pageId, title, canEdit, onClose, onRevisionsChanged, onSelectVersion }: Props) {
  const { token } = useAuth();
  const t = useTranslations("notes");
  const [revisions, setRevisions] = useState<PageRevision[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<PageRevision | null>(null);
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    listPageRevisions(token, pageId)
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
  }, [token, pageId]);

  async function handleDelete(revisionId: string) {
    if (!token) return;
    setDeleting(true);
    try {
      await deletePageRevision(token, pageId, revisionId);
      const next = (revisions ?? []).filter((r) => r.id !== revisionId);
      setRevisions(next);
      onRevisionsChanged?.(next);
      if (selected?.id === revisionId) setSelected(next[0] ?? null);
      setConfirmingDeleteId(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/20 print:hidden" onClick={onClose}>
      <div
        className="w-full max-w-[90vw] h-full bg-white shadow-xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 shrink-0">
          <div className="min-w-0">
            <h2 className="font-semibold text-slate-800">{t("versionHistory")}</h2>
            <p className="text-xs text-slate-400 truncate">{title}</p>
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
              storageKey="tack_page_version_history_split"
              defaultWidth={160}
              minWidth={120}
              maxWidth={Infinity}
              left={
                <div className="border-r border-slate-200 h-full py-2">
                  {revisions.map((rev) => (
                    <div key={rev.id} className={`flex items-center gap-1 px-2 ${selected?.id === rev.id ? "bg-rose-50" : ""}`}>
                      <button
                        type="button"
                        onClick={() => setSelected(rev)}
                        className={`flex-1 min-w-0 text-left px-1 py-1.5 text-xs ${
                          selected?.id === rev.id ? "text-rose-700 font-medium" : "text-slate-600 hover:bg-slate-50"
                        }`}
                      >
                        {t("version", { n: rev.version })}
                        <br />
                        <span className="text-slate-400">{new Date(rev.edited_at).toLocaleString()}</span>
                      </button>
                      {canEdit && (
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
                          className="text-xs font-medium text-rose-700 hover:text-rose-900 border border-rose-200 hover:border-rose-300 rounded px-2 py-1"
                        >
                          {t("viewThisVersion")}
                        </button>
                      )}
                      <NoteMarkdown body={selected.content_markdown} />
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
