"use client";

import { useEffect, useRef, useState } from "react";
import { Link } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { useAuth } from "@/contexts/AuthContext";
import { useTeam } from "@/contexts/TeamContext";
import { listNotes, type Note } from "@/lib/tack-server-api";

const PAGE_SIZE = 20;

/** Paginated (limit/offset, via GET /notes) top-level notes list for the
 * active team — a team's note volume isn't bounded, so this loads a page
 * at a time rather than everything up front. Resets (and discards any
 * stale in-flight fetch, via `generationRef`) whenever the active team
 * changes. */
export default function NotesList() {
  const { token } = useAuth();
  const { activeTeam } = useTeam();
  const t = useTranslations("navigator");
  const [notes, setNotes] = useState<Note[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const generationRef = useRef(0);

  useEffect(() => {
    generationRef.current += 1;
    const generation = generationRef.current;
    setNotes([]);
    setHasMore(false);
    setError(null);
    if (!token || !activeTeam) return;
    setLoading(true);
    listNotes(token, activeTeam.id, { limit: PAGE_SIZE, offset: 0 })
      .then((page) => {
        if (generation !== generationRef.current) return;
        setNotes(page.notes);
        setHasMore(page.has_more);
      })
      .catch((e) => {
        if (generation === generationRef.current) setError(e.message);
      })
      .finally(() => {
        if (generation === generationRef.current) setLoading(false);
      });
  }, [token, activeTeam]);

  function loadMore() {
    if (!token || !activeTeam || loading) return;
    const generation = generationRef.current;
    setLoading(true);
    listNotes(token, activeTeam.id, { limit: PAGE_SIZE, offset: notes.length })
      .then((page) => {
        if (generation !== generationRef.current) return;
        setNotes((prev) => [...prev, ...page.notes]);
        setHasMore(page.has_more);
      })
      .catch((e) => {
        if (generation === generationRef.current) setError(e.message);
      })
      .finally(() => {
        if (generation === generationRef.current) setLoading(false);
      });
  }

  if (!activeTeam) return <p className="px-2 py-1 text-xs text-slate-400">{t("selectTeamFirst")}</p>;
  if (error) return <p className="px-2 py-1 text-xs text-red-600">{error}</p>;

  return (
    <div>
      {notes.length === 0 && !loading && <p className="px-2 py-1 text-xs text-slate-400">{t("noNotes")}</p>}
      {notes.map((note) => (
        <Link
          key={note.id}
          href={`/notes/${note.id}`}
          className="block truncate rounded px-2 py-1 text-sm text-slate-700 hover:bg-slate-100"
        >
          {note.body_markdown.slice(0, 60) || t("untitledNote")}
        </Link>
      ))}
      {loading && <p className="px-2 py-1 text-xs text-slate-400">{t("loading")}</p>}
      {hasMore && !loading && (
        <button
          type="button"
          onClick={loadMore}
          className="w-full px-2 py-1 text-left text-xs font-medium text-rose-700 hover:underline"
        >
          {t("loadMore")}
        </button>
      )}
    </div>
  );
}
