"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface Props {
  left: React.ReactNode;
  right: React.ReactNode;
  /** localStorage key the chosen width is persisted under, so it survives
   * navigation/reloads — keyed per call site since different splits
   * shouldn't share a width. */
  storageKey: string;
  defaultWidth?: number;
  minWidth?: number;
  maxWidth?: number;
}

/** Two-pane layout with a draggable handle between the panes. Width lives in
 * local state (not a ref) so the layout re-renders while dragging; only
 * committed to localStorage on drag end to avoid thrashing storage on every
 * mousemove. Adapted from lagan's ResizableSplit (same component shape,
 * same behavior) — this is Tack's own copy, not a shared package, matching
 * the "graduate to packages/ once proven on a real screen" plan for this repo.
 *
 * `left` and the drag handle are `print:hidden` -- this is the workspace
 * shell's own split (Navigator | note/page content), and printing a note or
 * page should only ever produce the content itself, not the browsing chrome
 * around it. Export (F6) relies on this rather than a separate print route. */
export default function ResizableSplit({
  left,
  right,
  storageKey,
  defaultWidth = 288,
  minWidth = 220,
  maxWidth = 640,
}: Props) {
  const [width, setWidth] = useState(defaultWidth);
  const [dragging, setDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const saved = window.localStorage.getItem(storageKey);
    const parsed = saved ? Number(saved) : NaN;
    if (!Number.isNaN(parsed)) setWidth(Math.min(maxWidth, Math.max(minWidth, parsed)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  const handlePointerMove = useCallback(
    (e: PointerEvent) => {
      if (!containerRef.current) return;
      const left = containerRef.current.getBoundingClientRect().left;
      const next = Math.min(maxWidth, Math.max(minWidth, e.clientX - left));
      setWidth(next);
    },
    [minWidth, maxWidth]
  );

  useEffect(() => {
    if (!dragging) return;
    function handleUp() {
      setDragging(false);
      setWidth((w) => {
        window.localStorage.setItem(storageKey, String(w));
        return w;
      });
    }
    document.addEventListener("pointermove", handlePointerMove);
    document.addEventListener("pointerup", handleUp);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    return () => {
      document.removeEventListener("pointermove", handlePointerMove);
      document.removeEventListener("pointerup", handleUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [dragging, handlePointerMove, storageKey]);

  return (
    <div ref={containerRef} className="flex items-stretch h-full min-h-0">
      <div style={{ width }} className="shrink-0 overflow-y-auto print:hidden">
        {left}
      </div>
      <div
        role="separator"
        aria-orientation="vertical"
        onPointerDown={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        className={`w-2.5 shrink-0 cursor-col-resize flex items-center justify-center group self-stretch print:hidden ${
          dragging ? "bg-rose-100" : ""
        }`}
      >
        <div
          className={`w-0.5 h-full rounded-full transition-colors ${
            dragging ? "bg-rose-400" : "bg-transparent group-hover:bg-slate-300"
          }`}
        />
      </div>
      <div className="flex-1 min-w-0 overflow-y-auto print:overflow-visible print:w-full">{right}</div>
    </div>
  );
}
