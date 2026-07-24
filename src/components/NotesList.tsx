"use client";

import { useEffect, useRef, useState } from "react";
import { Link, useRouter } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { useAuth } from "@/contexts/AuthContext";
import { useTeam } from "@/contexts/TeamContext";
import { createNote, listNotes, type Note, type Visibility } from "@/lib/tack-server-api";
import MarkdownComposer from "@/components/MarkdownComposer";
import { useNoteEvents } from "@/contexts/NoteEventsContext";

const PAGE_SIZE = 20;

/** Paginated (limit/offset, via GET /notes) top-level notes list for the
 * active team — a team's note volume isn't bounded, so this loads a page
 * at a time rather than everything up front. Resets (and discards any
 * stale in-flight fetch, via `generationRef`) whenever the active team
 * changes. Also refetches on the shared refresh timer/button (see
 * NoteEventsContext.tsx), so a note created by someone else appears
 * without a manual reload. */
export default function NotesList() {
  const { token } = useAuth();
  const { activeTeam } = useTeam();
  const router = useRouter();
  const { subscribe, subscribeRefresh } = useNoteEvents();
  const t = useTranslations("navigator");
  const tNotes = useTranslations("notes");
  const [notes, setNotes] = useState<Note[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const generationRef = useRef(0);
  const notesLengthRef = useRef(0);

  const [composing, setComposing] = useState(false);
  const [newVisibility, setNewVisibility] = useState<Visibility>("private");
  const [newTitle, setNewTitle] = useState("");
  const [newBody, setNewBody] = useState("");
  const [creating, setCreating] = useState(false);

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

  // NoteThread (a sibling in the right-hand pane) broadcasts metadata
  // changes -- like a title edit -- through this shared pub/sub, since
  // there's no other way for this list's own cached notes to learn about
  // them (see NoteEventsContext.tsx).
  useEffect(() => {
    return subscribe((noteId, patch) => {
      setNotes((prev) => prev.map((n) => (n.id === noteId ? { ...n, ...patch } : n)));
    });
  }, [subscribe]);

  useEffect(() => {
    notesLengthRef.current = notes.length;
  }, [notes]);

  // Driven by the single shared RefreshControl in the Navigator (see
  // NoteEventsContext.tsx) rather than owning its own timer -- re-fetches
  // however many notes are currently loaded (at least PAGE_SIZE), so a new
  // note created by someone else becomes visible without a full reload.
  useEffect(() => {
    return subscribeRefresh(async () => {
      if (!token || !activeTeam) return;
      generationRef.current += 1;
      const generation = generationRef.current;
      const limit = Math.max(notesLengthRef.current, PAGE_SIZE);
      try {
        const page = await listNotes(token, activeTeam.id, { limit, offset: 0 });
        if (generation !== generationRef.current) return;
        setNotes(page.notes);
        setHasMore(page.has_more);
      } catch (e) {
        if (generation === generationRef.current) setError((e as Error).message);
      }
    });
  }, [subscribeRefresh, token, activeTeam]);

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

  async function handleCreate() {
    if (!token || !activeTeam || !newTitle.trim() || !newBody.trim() || creating) return;
    setCreating(true);
    try {
      const note = await createNote(token, {
        team_id: activeTeam.id,
        visibility: newVisibility,
        title: newTitle.trim(),
        body_markdown: newBody.trim(),
      });
      setNotes((prev) => [note, ...prev]);
      setComposing(false);
      setNewTitle("");
      setNewBody("");
      setNewVisibility("private");
      router.push(`/notes/${note.id}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCreating(false);
    }
  }

  if (!activeTeam) return <p className="px-2 py-1 text-xs text-slate-400">{t("selectTeamFirst")}</p>;
  if (error) return <p className="px-2 py-1 text-xs text-red-600">{error}</p>;

  return (
    <div>
      {notes.length === 0 && !loading && !composing && <p className="px-2 py-1 text-xs text-slate-400">{t("noNotes")}</p>}
      {notes.map((note) => (
        <Link
          key={note.id}
          href={`/notes/${note.id}`}
          className="block truncate rounded px-2 py-1 text-sm text-slate-700 hover:bg-slate-100"
        >
          {note.title || t("untitledNote")}
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

      {composing ? (
        <div className="px-2 py-2 space-y-2">
          <input
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder={tNotes("titlePlaceholder")}
            disabled={creating}
            className="w-full text-sm rounded border border-slate-200 px-2 py-1 focus:border-rose-400 focus:outline-none focus:ring-1 focus:ring-rose-400"
          />
          <select
            value={newVisibility}
            onChange={(e) => setNewVisibility(e.target.value as Visibility)}
            disabled={creating}
            className="text-xs rounded border border-slate-200 px-1.5 py-1"
          >
            <option value="private">{tNotes("visibility.private")}</option>
            <option value="team">{tNotes("visibility.team")}</option>
            <option value="organization">{tNotes("visibility.organization")}</option>
          </select>
          <MarkdownComposer value={newBody} onChange={setNewBody} disabled={creating} rows={4} />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setComposing(false);
                setNewTitle("");
                setNewBody("");
              }}
              className="text-xs text-slate-500 hover:text-slate-700 px-2 py-1"
            >
              {tNotes("cancel")}
            </button>
            <button
              type="button"
              onClick={handleCreate}
              disabled={creating || !newTitle.trim() || !newBody.trim()}
              className="text-xs bg-rose-700 hover:bg-rose-800 disabled:opacity-50 text-white px-3 py-1 rounded"
            >
              {creating ? tNotes("saving") : tNotes("save")}
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setComposing(true)}
          className="w-full text-left px-2 py-1 text-xs font-medium text-rose-700 hover:underline"
        >
          + {t("newNote")}
        </button>
      )}
    </div>
  );
}
