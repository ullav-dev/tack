"use client";

import { createContext, useCallback, useContext, useRef } from "react";
import type { Note } from "./api";

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
  /** Fires every registered refresh listener and resolves once they've all
   * settled -- call this from a host app's own refresh control, if it has
   * one (tack's own `RefreshControl` does). */
  triggerRefresh: () => Promise<void>;
}

const NoteEventsContext = createContext<NoteEventsContextValue | null>(null);

/** `TackNoteThread` (title/folder edits, deletions) and `TackNoteTree` (the
 * list that needs to react to them) are siblings with no other shared
 * state -- this is the pub/sub between them, extracted verbatim out of
 * `tack`'s own `NoteEventsContext`. Bundled as this package's own internal
 * wiring: a host app wraps both panels in `NoteEventsProvider` once and
 * otherwise never touches this context, except via `useNoteEvents()` if it
 * wants to drive `triggerRefresh` from its own refresh control. */
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
