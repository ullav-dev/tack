"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface Props {
  left: React.ReactNode;
  right: React.ReactNode;
  storageKey: string;
  defaultWidth?: number;
  minWidth?: number;
  maxWidth?: number;
}

/** Two-pane layout with a draggable handle between the panes. Extracted
 * verbatim from `tack`'s own `ResizableSplit.tsx` (itself adapted from
 * lagan's) -- an internal implementation detail of `VersionHistory`, not
 * part of this package's public surface. */
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
          dragging ? "bg-[var(--tnotes-100,#ffe4e6)]" : ""
        }`}
      >
        <div
          className={`w-0.5 h-full rounded-full transition-colors ${
            dragging ? "bg-[var(--tnotes-400,#fb7185)]" : "bg-transparent group-hover:bg-slate-300"
          }`}
        />
      </div>
      <div className="flex-1 min-w-0 overflow-y-auto print:overflow-visible print:w-full">{right}</div>
    </div>
  );
}
