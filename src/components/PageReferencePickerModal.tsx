"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useAuth } from "@/contexts/AuthContext";
import { createPageReference, searchPages, type Page } from "@/lib/tack-server-api";

interface Props {
  /** The page the reference is being inserted into -- used both to scope
   * the search (same space) and as the source side of the created
   * `content_references` row. */
  sourcePageId: string;
  spaceId: string;
  onInsert: (page: Page) => void;
  onClose: () => void;
}

/** Search-and-pick modal for embedding a live page-to-page cross-reference
 * (F7 8d) -- same plain centered-dialog shell as `DeleteNoteModal`/
 * `MyDetailsModal`, not the draggable `DamPickerModal` shell, since this is
 * a simple list-and-select rather than a rich asset browser. Selecting a
 * result both records the reference server-side (`POST /pages/:id/references`
 * -- this is what powers the target's backlinks list) and inserts a
 * `PageReferenceNode` into the editor via `onInsert`. */
export default function PageReferencePickerModal({ sourcePageId, spaceId, onInsert, onClose }: Props) {
  const { token } = useAuth();
  const t = useTranslations("editor");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Page[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [inserting, setInserting] = useState(false);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    const handle = setTimeout(() => {
      searchPages(token, spaceId, query)
        .then((r) => {
          if (!cancelled) setResults(r.filter((p) => p.id !== sourcePageId));
        })
        .catch((e) => {
          if (!cancelled) setError(e.message);
        });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [token, spaceId, query, sourcePageId]);

  async function handlePick(page: Page) {
    if (!token) return;
    setInserting(true);
    setError(null);
    try {
      await createPageReference(token, sourcePageId, page.id);
      onInsert(page);
    } catch (e) {
      setError((e as Error).message);
      setInserting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 print:hidden" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col max-h-[70vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 shrink-0">
          <h2 className="text-base font-semibold text-slate-800">{t("insertReference")}</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 transition-colors"
            aria-label="Close"
          >
            <svg viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4">
              <path d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.75.75 0 1 1 1.06 1.06L9.06 8l3.22 3.22a.75.75 0 1 1-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 0 1-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06z" />
            </svg>
          </button>
        </div>

        <div className="px-6 pt-4 shrink-0">
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("searchPages")}
            disabled={inserting}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-rose-400"
          />
        </div>

        <div className="px-6 py-4 flex-1 min-h-0 overflow-y-auto space-y-1">
          {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
          {results === null && !error && <p className="text-sm text-slate-400">{t("loading")}</p>}
          {results && results.length === 0 && <p className="text-sm text-slate-400">{t("noPagesFound")}</p>}
          {results?.map((page) => (
            <button
              key={page.id}
              type="button"
              disabled={inserting}
              onClick={() => handlePick(page)}
              className="w-full text-left px-3 py-2 rounded-lg text-sm text-slate-700 hover:bg-rose-50 hover:text-rose-700 disabled:opacity-50 truncate"
            >
              {page.title}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
