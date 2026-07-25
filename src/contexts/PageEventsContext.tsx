"use client";

import { createContext, useCallback, useContext, useRef } from "react";
import type { Page } from "@/lib/tack-server-api";

type Listener = (pageId: string, patch: Partial<Page>) => void;
type DeleteListener = (pageId: string) => void;

interface PageEventsContextValue {
  /** Broadcasts that a page's metadata (currently just `title`) changed —
   * called by PageEditor after a successful save. */
  notifyPageUpdated: (pageId: string, patch: Partial<Page>) => void;
  /** Returns an unsubscribe function. */
  subscribe: (listener: Listener) => () => void;
  /** Broadcasts that a page was deleted — called by PageEditor after a
   * successful delete, so PageTree drops it from its cached children
   * immediately rather than showing a stale (now-404ing) entry. */
  notifyPageDeleted: (pageId: string) => void;
  subscribeDeleted: (listener: DeleteListener) => () => void;
}

const PageEventsContext = createContext<PageEventsContextValue | null>(null);

/**
 * A minimal in-memory pub/sub, not a data-fetching layer: PageEditor (the
 * right-hand pane) and PageTree (the left-hand Navigator, potentially
 * several instances — one per expanded space) are sibling components with
 * no other way to learn about each other's changes. Editing a page's title
 * in PageEditor doesn't otherwise touch PageTree's own cached page list, so
 * without this the Navigator would show a stale title until the user
 * manually reloads. Scoped to the (workspace) route group's layout, so it
 * doesn't leak into unrelated parts of the app.
 */
export function PageEventsProvider({ children }: { children: React.ReactNode }) {
  const listenersRef = useRef<Set<Listener>>(new Set());
  const deleteListenersRef = useRef<Set<DeleteListener>>(new Set());

  const notifyPageUpdated = useCallback((pageId: string, patch: Partial<Page>) => {
    listenersRef.current.forEach((listener) => listener(pageId, patch));
  }, []);

  const subscribe = useCallback((listener: Listener) => {
    listenersRef.current.add(listener);
    return () => {
      listenersRef.current.delete(listener);
    };
  }, []);

  const notifyPageDeleted = useCallback((pageId: string) => {
    deleteListenersRef.current.forEach((listener) => listener(pageId));
  }, []);

  const subscribeDeleted = useCallback((listener: DeleteListener) => {
    deleteListenersRef.current.add(listener);
    return () => {
      deleteListenersRef.current.delete(listener);
    };
  }, []);

  return (
    <PageEventsContext.Provider
      value={{ notifyPageUpdated, subscribe, notifyPageDeleted, subscribeDeleted }}
    >
      {children}
    </PageEventsContext.Provider>
  );
}

export function usePageEvents() {
  const ctx = useContext(PageEventsContext);
  if (!ctx) throw new Error("usePageEvents must be used within a PageEventsProvider");
  return ctx;
}
