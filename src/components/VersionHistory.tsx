"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useAuth } from "@/contexts/AuthContext";
import { listRevisions, type NoteRevision } from "@/lib/tack-server-api";
import NoteMarkdown from "@/components/NoteMarkdown";

interface Props {
  noteId: string;
  onClose: () => void;
}

/** Revision history drawer for a Note — `GET /notes/:id/revisions` is
 * fully supported server-side today; a revision is only created when the
 * note owner explicitly clicks "Save as version" (`POST
 * /notes/:id/revisions`), not automatically on every edit. Unlike Pages,
 * which need backend step 8c (named-snapshot history) before an equivalent
 * view is possible there. */
export default function VersionHistory({ noteId, onClose }: Props) {
  const { token } = useAuth();
  const t = useTranslations("notes");
  const [revisions, setRevisions] = useState<NoteRevision[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<NoteRevision | null>(null);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    listRevisions(token, noteId)
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
  }, [token, noteId]);

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/20" onClick={onClose}>
      <div
        className="w-full max-w-lg h-full bg-white shadow-xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 shrink-0">
          <h2 className="font-semibold text-slate-800">{t("versionHistory")}</h2>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600 text-sm">
            {t("close")}
          </button>
        </div>
        <div className="flex-1 flex min-h-0">
          <div className="w-40 shrink-0 border-r border-slate-200 overflow-y-auto py-2">
            {error && <p className="px-3 text-xs text-red-600">{error}</p>}
            {!revisions && !error && <p className="px-3 text-xs text-slate-400">{t("loading")}</p>}
            {revisions?.map((rev) => (
              <button
                key={rev.id}
                type="button"
                onClick={() => setSelected(rev)}
                className={`block w-full text-left px-3 py-1.5 text-xs ${
                  selected?.id === rev.id ? "bg-rose-50 text-rose-700 font-medium" : "text-slate-600 hover:bg-slate-50"
                }`}
              >
                {t("version", { n: rev.version })}
                <br />
                <span className="text-slate-400">{new Date(rev.edited_at).toLocaleString()}</span>
              </button>
            ))}
          </div>
          <div className="flex-1 overflow-y-auto p-4">
            {selected ? <NoteMarkdown body={selected.body_markdown} /> : <p className="text-sm text-slate-400">{t("noVersions")}</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
