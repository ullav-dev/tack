"use client";

import { useEffect, useRef, useState, type ComponentType } from "react";
import { useNoteEvents } from "./NoteEventsContext";
import type { Note, TackNotesApi } from "./api";
import MarkdownComposer from "./MarkdownComposer";
import Pager from "./Pager";
import { noteIcon } from "./Icon";
import type { TFunction } from "./types";

const PAGE_SIZE = 25;

function totalPages(total: number): number {
  return Math.max(1, Math.ceil(total / PAGE_SIZE));
}

export interface TackPersonalNotesListProps {
  api: TackNotesApi;
  /** The currently-selected note's id, if the host app's own routing has one
   * open (drives the "selected" highlight on a note row). */
  selectedNoteId?: string;
  buildNoteHref: (noteId: string) => string;
  onNavigate: (noteId: string) => void;
  /** Defaults to a plain `<a>`. Pass e.g. Next's `Link` for client-side
   * navigation -- same convention as `TackNoteTree`. */
  LinkComponent?: ComponentType<{ href: string; className?: string; children: React.ReactNode }>;
  /** Calls `t("navigator")` namespace keys. */
  t: TFunction;
  /** Calls `t("notes")` namespace keys (title placeholder, save/cancel --
   * shared with the inline composer). */
  tNotes: TFunction;
  ImagePicker?: ComponentType<{ onSelect: (asset: { url: string; name: string }) => void; onClose: () => void }>;
}

const DefaultAnchor: ComponentType<{ href: string; className?: string; children: React.ReactNode }> = ({ href, className, children }) => (
  <a href={href} className={className}>
    {children}
  </a>
);

/** A flat list of the caller's own personal (team-less) notes -- the
 * companion to `TackNoteTree`'s per-team folder browser, for tack-server's
 * `GET /notes` personal mode (`team_id` omitted -- see that endpoint's own
 * doc comment). Deliberately flat, not a tree: a personal note has no team,
 * so it has no folder concept at all (tack-server rejects filing one into a
 * folder outright) -- there's nothing here for a folder UI to organize.
 * Visibility is fixed to "private" in the composer below, not a dropdown
 * like `TackNoteTree`'s -- a personal note can only ever be private (the
 * server enforces this; the UI doesn't offer the other options at all
 * rather than letting a user pick one only to get a 400 back). */
export default function TackPersonalNotesList({
  api,
  selectedNoteId,
  buildNoteHref,
  onNavigate,
  LinkComponent,
  t,
  tNotes,
  ImagePicker,
}: TackPersonalNotesListProps) {
  const Link = LinkComponent ?? DefaultAnchor;
  const { subscribe, subscribeDeleted, subscribeRefresh } = useNoteEvents();

  const [notes, setNotes] = useState<Note[] | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [composing, setComposing] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newBody, setNewBody] = useState("");
  const [creating, setCreating] = useState(false);

  const generationRef = useRef(0);
  const notesRef = useRef<Note[] | null>(null);

  async function fetchNotes(generation: number, targetPage: number) {
    setLoading(true);
    try {
      const result = await api.listNotes(undefined, { limit: PAGE_SIZE, offset: (targetPage - 1) * PAGE_SIZE });
      if (generation !== generationRef.current) return;
      notesRef.current = result.notes;
      setNotes(result.notes);
      setTotal(result.total);
      setPage(targetPage);
    } catch (e) {
      if (generation === generationRef.current) setError((e as Error).message);
    } finally {
      if (generation === generationRef.current) setLoading(false);
    }
  }

  useEffect(() => {
    generationRef.current += 1;
    fetchNotes(generationRef.current, 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    return subscribe((noteId, patch) => {
      const current = notesRef.current;
      if (!current) return;
      const next = current.map((n) => (n.id === noteId ? { ...n, ...patch } : n));
      notesRef.current = next;
      setNotes(next);
    });
  }, [subscribe]);

  useEffect(() => {
    return subscribeDeleted((noteId) => {
      const current = notesRef.current;
      if (!current) return;
      const next = current.filter((n) => n.id !== noteId);
      notesRef.current = next;
      setNotes(next);
    });
  }, [subscribeDeleted]);

  useEffect(() => {
    return subscribeRefresh(() => {
      generationRef.current += 1;
      fetchNotes(generationRef.current, page);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subscribeRefresh, page]);

  async function handleCreate() {
    if (!newTitle.trim() || !newBody.trim() || creating) return;
    setCreating(true);
    try {
      const note = await api.createNote({
        visibility: "private",
        title: newTitle.trim(),
        body_markdown: newBody.trim(),
      });
      generationRef.current += 1;
      await fetchNotes(generationRef.current, 1);
      setComposing(false);
      setNewTitle("");
      setNewBody("");
      onNavigate(note.id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCreating(false);
    }
  }

  return (
    <div>
      {error && <p className="px-2 py-1 text-xs text-red-600">{error}</p>}

      {!notes && !error && <p className="px-2 py-1 text-xs text-slate-400">{t("loading")}</p>}
      {notes?.map((note) => {
        const isSelected = selectedNoteId === note.id;
        return (
          <Link
            key={note.id}
            href={buildNoteHref(note.id)}
            className={`flex items-center gap-1.5 rounded px-2 py-1 text-sm ${
              isSelected ? "bg-[var(--tnotes-50,#fff1f2)] text-[var(--tnotes-700,#be123c)] font-medium" : "text-slate-700 hover:bg-slate-100"
            }`}
          >
            <span className={`shrink-0 ${isSelected ? "text-[var(--tnotes-400,#fb7185)]" : "text-slate-300"}`}>{noteIcon}</span>
            <span className="truncate">{note.title || t("untitledNote")}</span>
          </Link>
        );
      })}
      {notes?.length === 0 && <p className="text-xs text-slate-400 px-2 py-1">{t("noNotes")}</p>}
      {loading && notes && notes.length > 0 && <p className="text-xs text-slate-400 px-2 py-1">{t("loading")}</p>}
      <Pager page={page} totalPages={totalPages(total)} onChange={(p) => fetchNotes(generationRef.current, p)} disabled={loading} t={t} />

      {composing ? (
        <div className="space-y-2 px-2 py-2">
          <input
            autoFocus
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder={tNotes("titlePlaceholder")}
            disabled={creating}
            className="box-border w-full text-sm rounded border border-slate-200 px-2 py-1 focus:border-[var(--tnotes-400,#fb7185)] focus:outline-none focus:ring-1 focus:ring-[var(--tnotes-400,#fb7185)]"
          />
          <MarkdownComposer value={newBody} onChange={setNewBody} disabled={creating} rows={4} t={tNotes} ImagePicker={ImagePicker} />
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
              className="text-xs bg-[var(--tnotes-700,#be123c)] hover:bg-[var(--tnotes-800,#9f1239)] disabled:opacity-50 text-white px-3 py-1 rounded"
            >
              {creating ? tNotes("saving") : tNotes("save")}
            </button>
          </div>
        </div>
      ) : (
        <button type="button" onClick={() => setComposing(true)} className="block px-2 py-1 text-xs font-medium text-[var(--tnotes-700,#be123c)] hover:underline">
          + {t("newNote")}
        </button>
      )}
    </div>
  );
}
