"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useAuth } from "@/contexts/AuthContext";
import { getNote, listReplies, type Note } from "@/lib/tack-server-api";

/** Note thread viewer — plain read-only preview for now. Phase F4 replaces
 * this with the real react-markdown-rendered thread, reply composer, edit
 * mode, and version history panel. */
export default function NoteThreadPage() {
  const { noteId } = useParams<{ noteId: string }>();
  const { token } = useAuth();
  const t = useTranslations("navigator");
  const [note, setNote] = useState<Note | null>(null);
  const [replies, setReplies] = useState<Note[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    Promise.all([getNote(token, noteId), listReplies(token, noteId)])
      .then(([n, r]) => {
        if (cancelled) return;
        setNote(n);
        setReplies(r);
      })
      .catch((e) => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [token, noteId]);

  if (error) return <p className="p-6 text-red-600">{error}</p>;
  if (!note) return <p className="p-6 text-slate-400">{t("loading")}</p>;

  return (
    <div className="p-6 max-w-3xl space-y-4">
      <pre className="whitespace-pre-wrap font-sans text-slate-700">{note.body_markdown}</pre>
      {replies.length > 0 && (
        <div className="border-t border-slate-200 pt-4 space-y-3">
          {replies.map((reply) => (
            <pre key={reply.id} className="whitespace-pre-wrap font-sans text-slate-600 pl-4 border-l-2 border-slate-200">
              {reply.body_markdown}
            </pre>
          ))}
        </div>
      )}
    </div>
  );
}
