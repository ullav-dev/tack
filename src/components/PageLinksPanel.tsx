"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useAuth } from "@/contexts/AuthContext";
import { useRouter } from "@/i18n/navigation";
import {
  deletePageReference,
  listPageBacklinks,
  listPageReferences,
  type PageBacklink,
  type PageReference,
} from "@/lib/tack-server-api";

interface Props {
  pageId: string;
  canEdit: boolean;
  onClose: () => void;
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

/** Shows both directions of a Page's cross-references (F7 8d, page-to-page
 * only): outgoing "References" (links this page's content embeds, deletable
 * here independent of removing the `PageReferenceNode` from the doc itself
 * -- the two aren't kept in sync automatically, a known simplification, same
 * spirit as the DAM-embed/content_markdown staleness trade-offs elsewhere in
 * this app) and incoming "Backlinks" (other pages that reference this one,
 * read-only -- always resolved live server-side, never a stored/stale
 * snapshot). Both `target_title`/`source_title` can be `null` -- the
 * referenced/referencing page no longer exists or isn't visible to the
 * caller -- rendered as a visible "broken link" row, not hidden or errored. */
export default function PageLinksPanel({ pageId, canEdit, onClose }: Props) {
  const { token } = useAuth();
  const router = useRouter();
  const t = useTranslations("editor");
  const tNotes = useTranslations("notes");
  const [references, setReferences] = useState<PageReference[] | null>(null);
  const [backlinks, setBacklinks] = useState<PageBacklink[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    Promise.all([listPageReferences(token, pageId), listPageBacklinks(token, pageId)])
      .then(([refs, links]) => {
        if (cancelled) return;
        setReferences(refs);
        setBacklinks(links);
      })
      .catch((e) => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [token, pageId]);

  async function handleDeleteReference(referenceId: string) {
    if (!token) return;
    try {
      await deletePageReference(token, pageId, referenceId);
      setReferences((prev) => (prev ?? []).filter((r) => r.id !== referenceId));
    } catch (e) {
      setError((e as Error).message);
    }
  }

  function goTo(targetSpaceId: string | null, targetPageId: string) {
    if (!targetSpaceId) return;
    router.push(`/spaces/${targetSpaceId}/pages/${targetPageId}`);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/20 print:hidden" onClick={onClose}>
      <div className="w-full max-w-md h-full bg-white shadow-xl flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 shrink-0">
          <h2 className="font-semibold text-slate-800">{t("pageLinks")}</h2>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600 text-sm shrink-0">
            {tNotes("close")}
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {error && <p className="px-4 py-2 text-xs text-red-600">{error}</p>}

          <div className="px-4 py-3 border-b border-slate-100">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-2">{t("references")}</h3>
            {references === null && !error && <p className="text-xs text-slate-400">{tNotes("loading")}</p>}
            {references && references.length === 0 && <p className="text-xs text-slate-400">{t("noReferences")}</p>}
            <ul className="space-y-1">
              {references?.map((ref) => (
                <li key={ref.id} className="flex items-center gap-1">
                  {ref.target_title ? (
                    <button
                      type="button"
                      onClick={() => goTo(ref.target_space_id, ref.target_page_id)}
                      className="flex-1 min-w-0 text-left px-2 py-1.5 text-sm text-rose-700 hover:bg-rose-50 rounded truncate"
                    >
                      {ref.target_title}
                    </button>
                  ) : (
                    <span className="flex-1 min-w-0 px-2 py-1.5 text-sm text-slate-400 italic truncate">
                      {t("brokenReference")}
                    </span>
                  )}
                  {canEdit && (
                    <button
                      type="button"
                      title={tNotes("delete")}
                      aria-label={tNotes("delete")}
                      onClick={() => handleDeleteReference(ref.id)}
                      className="w-5 h-5 shrink-0 rounded flex items-center justify-center text-slate-300 hover:text-red-600 hover:bg-red-50"
                    >
                      {deleteIcon}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </div>

          <div className="px-4 py-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-2">{t("backlinks")}</h3>
            {backlinks === null && !error && <p className="text-xs text-slate-400">{tNotes("loading")}</p>}
            {backlinks && backlinks.length === 0 && <p className="text-xs text-slate-400">{t("noBacklinks")}</p>}
            <ul className="space-y-1">
              {backlinks?.map((link) => (
                <li key={link.id}>
                  {link.source_title ? (
                    <button
                      type="button"
                      onClick={() => goTo(link.source_space_id, link.source_page_id)}
                      className="w-full text-left px-2 py-1.5 text-sm text-slate-700 hover:bg-slate-50 rounded truncate"
                    >
                      {link.source_title}
                    </button>
                  ) : (
                    <span className="block px-2 py-1.5 text-sm text-slate-400 italic truncate">
                      {t("brokenReference")}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
