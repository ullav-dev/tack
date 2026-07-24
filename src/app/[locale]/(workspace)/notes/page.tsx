"use client";

import { useEffect, useState } from "react";
import { Link } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { useAuth } from "@/contexts/AuthContext";
import { useTeam } from "@/contexts/TeamContext";
import { listNotes, type Note } from "@/lib/tack-server-api";

/** Notes list for the active team — plain, unpaginated-UI placeholder for
 * now (the backend already supports limit/offset). Phase F2 replaces this
 * with the real Navigator-integrated, paginated/lazy-loaded list. */
export default function NotesListPage() {
  const { token } = useAuth();
  const { activeTeam } = useTeam();
  const t = useTranslations("navigator");
  const [notes, setNotes] = useState<Note[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token || !activeTeam) return;
    let cancelled = false;
    listNotes(token, activeTeam.id)
      .then((page) => {
        if (!cancelled) setNotes(page.notes);
      })
      .catch((e) => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [token, activeTeam]);

  if (!activeTeam) return <p className="p-6 text-slate-400">{t("selectTeamFirst")}</p>;

  return (
    <div className="p-6">
      {error && <p className="text-red-600">{error}</p>}
      {!notes && !error && <p className="text-slate-400">{t("loading")}</p>}
      {notes && notes.length === 0 && <p className="text-slate-400">{t("noNotes")}</p>}
      <ul className="space-y-2">
        {notes?.map((note) => (
          <li key={note.id}>
            <Link href={`/notes/${note.id}`} className="text-rose-700 hover:underline">
              {note.body_markdown.slice(0, 80) || t("untitledNote")}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
