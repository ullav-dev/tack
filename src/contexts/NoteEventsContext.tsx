"use client";

import { createContext, useCallback, useContext, useRef } from "react";
import type { Note } from "@/lib/tack-server-api";

type Listener = (noteId: string, patch: Partial<Note>) => void;

interface NoteEventsContextValue {
  notifyNoteUpdated: (noteId: string, patch: Partial<Note>) => void;
  subscribe: (listener: Listener) => () => void;
}

const NoteEventsContext = createContext<NoteEventsContextValue | null>(null);

/** Same small pub/sub shape as `PageEventsContext` (see that file for the
 * full rationale) — NotesList (left panel) needs to learn about a title
 * edit made in NoteThread (right panel); they're siblings with no other
 * shared state. Kept as its own separate context rather than generalizing
 * `PageEventsContext` to cover both content types, matching this codebase's
 * preference for a second small copy over a premature shared abstraction. */
export function NoteEventsProvider({ children }: { children: React.ReactNode }) {
  const listenersRef = useRef<Set<Listener>>(new Set());

  const notifyNoteUpdated = useCallback((noteId: string, patch: Partial<Note>) => {
    listenersRef.current.forEach((listener) => listener(noteId, patch));
  }, []);

  const subscribe = useCallback((listener: Listener) => {
    listenersRef.current.add(listener);
    return () => {
      listenersRef.current.delete(listener);
    };
  }, []);

  return (
    <NoteEventsContext.Provider value={{ notifyNoteUpdated, subscribe }}>{children}</NoteEventsContext.Provider>
  );
}

export function useNoteEvents() {
  const ctx = useContext(NoteEventsContext);
  if (!ctx) throw new Error("useNoteEvents must be used within a NoteEventsProvider");
  return ctx;
}
