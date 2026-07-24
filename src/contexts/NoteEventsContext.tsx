"use client";

import { createContext, useCallback, useContext, useRef } from "react";
import type { Note } from "@/lib/tack-server-api";

type Listener = (noteId: string, patch: Partial<Note>) => void;
type DeleteListener = (noteId: string) => void;
type RefreshListener = () => Promise<void> | void;

interface NoteEventsContextValue {
  notifyNoteUpdated: (noteId: string, patch: Partial<Note>) => void;
  subscribe: (listener: Listener) => () => void;
  notifyNoteDeleted: (noteId: string) => void;
  subscribeDeleted: (listener: DeleteListener) => () => void;
  /** Register to be re-fetched when the shared refresh timer/button fires. */
  subscribeRefresh: (listener: RefreshListener) => () => void;
  /** Fires every registered refresh listener and resolves once they've all settled. */
  triggerRefresh: () => Promise<void>;
}

const NoteEventsContext = createContext<NoteEventsContextValue | null>(null);

/** Same small pub/sub shape as `PageEventsContext` (see that file for the
 * full rationale) — NotesList (left panel) needs to learn about a title
 * edit made in NoteThread (right panel); they're siblings with no other
 * shared state. Kept as its own separate context rather than generalizing
 * `PageEventsContext` to cover both content types, matching this codebase's
 * preference for a second small copy over a premature shared abstraction.
 *
 * Also carries a deletion pub/sub (NotesList drops a note from its cached
 * list the moment it's deleted in NoteThread, rather than waiting for the
 * next refresh tick), and a second, independent pub/sub for the shared
 * auto/manual refresh timer: one `RefreshControl` lives in the Navigator
 * (always mounted, unlike NoteThread which unmounts per note) and drives
 * both the Notes list and whichever note thread is currently open from a
 * single timer/button, rather than each panel running its own. */
export function NoteEventsProvider({ children }: { children: React.ReactNode }) {
  const listenersRef = useRef<Set<Listener>>(new Set());
  const deleteListenersRef = useRef<Set<DeleteListener>>(new Set());
  const refreshListenersRef = useRef<Set<RefreshListener>>(new Set());

  const notifyNoteUpdated = useCallback((noteId: string, patch: Partial<Note>) => {
    listenersRef.current.forEach((listener) => listener(noteId, patch));
  }, []);

  const subscribe = useCallback((listener: Listener) => {
    listenersRef.current.add(listener);
    return () => {
      listenersRef.current.delete(listener);
    };
  }, []);

  const notifyNoteDeleted = useCallback((noteId: string) => {
    deleteListenersRef.current.forEach((listener) => listener(noteId));
  }, []);

  const subscribeDeleted = useCallback((listener: DeleteListener) => {
    deleteListenersRef.current.add(listener);
    return () => {
      deleteListenersRef.current.delete(listener);
    };
  }, []);

  const subscribeRefresh = useCallback((listener: RefreshListener) => {
    refreshListenersRef.current.add(listener);
    return () => {
      refreshListenersRef.current.delete(listener);
    };
  }, []);

  const triggerRefresh = useCallback(async () => {
    await Promise.all(Array.from(refreshListenersRef.current).map((listener) => listener()));
  }, []);

  return (
    <NoteEventsContext.Provider
      value={{ notifyNoteUpdated, subscribe, notifyNoteDeleted, subscribeDeleted, subscribeRefresh, triggerRefresh }}
    >
      {children}
    </NoteEventsContext.Provider>
  );
}

export function useNoteEvents() {
  const ctx = useContext(NoteEventsContext);
  if (!ctx) throw new Error("useNoteEvents must be used within a NoteEventsProvider");
  return ctx;
}
