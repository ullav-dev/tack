"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { createPortal } from "react-dom";
import dynamic from "next/dynamic";
import type { PickedAsset } from "@ullav/dam-picker";

const DamPicker = dynamic(
  () => import("@ullav/dam-picker").then((m) => m.DamPicker),
  { ssr: false }
);

interface Props {
  token: string;
  onSelect: (asset: PickedAsset) => void;
  onClose: () => void;
}

function usernameFromToken(token: string): string | undefined {
  try {
    const payload = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    return payload.username as string | undefined;
  } catch { return undefined; }
}

const DEFAULT_W = 560;
const DEFAULT_H = 440;

/** Draggable/resizable floating picker for embedding a Comad (DAM) asset —
 * same shell/chrome as togra's `DamPickerModal` (drag title bar, three
 * resize handles, Esc to close), just rebranded rose-700 to match the rest
 * of Tack rather than togra's violet. The underlying `@ullav/dam-picker`
 * package is Tack's own copy (per-repo-copy convention, same as togra's),
 * proxied through `/api/dam` (see `src/proxy.ts`). */
export default function DamPickerModal({ token, onSelect, onClose }: Props) {
  const [pos, setPos] = useState(() => ({
    x: typeof window !== "undefined" ? Math.max(20, (window.innerWidth  - DEFAULT_W) / 2) : 100,
    y: typeof window !== "undefined" ? Math.max(20, (window.innerHeight - DEFAULT_H) / 3) : 80,
  }));
  const [size, setSize] = useState({ w: DEFAULT_W, h: DEFAULT_H });
  const [mounted, setMounted] = useState(false);

  const modalRef  = useRef<HTMLDivElement>(null);
  const dragRef   = useRef<{ px: number; py: number; ox: number; oy: number } | null>(null);
  const resizeRef = useRef<{ px: number; py: number; ow: number; oh: number } | null>(null);

  useEffect(() => {
    setMounted(true);
    // Focus the modal so keyboard events (Esc) are captured here
    requestAnimationFrame(() => modalRef.current?.focus());
  }, []);

  // ── Keyboard: Esc closes the modal ───────────────────────────────────────

  const onKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      onClose();
    }
  }, [onClose]);

  // ── Drag title bar ────────────────────────────────────────────────────────

  const onTitlePointerDown = useCallback((e: React.PointerEvent) => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { px: e.clientX, py: e.clientY, ox: pos.x, oy: pos.y };
  }, [pos]);

  const onTitlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragRef.current) return;
    setPos({
      x: Math.max(0, dragRef.current.ox + (e.clientX - dragRef.current.px)),
      y: Math.max(0, dragRef.current.oy + (e.clientY - dragRef.current.py)),
    });
  }, []);

  const onTitlePointerUp = useCallback(() => { dragRef.current = null; }, []);

  // ── Resize handles ────────────────────────────────────────────────────────

  type ResizeDir = "e" | "s" | "se";
  const resizeDirRef = useRef<ResizeDir>("se");

  function makeResizeHandlers(dir: ResizeDir) {
    return {
      onPointerDown(e: React.PointerEvent) {
        e.stopPropagation();
        e.currentTarget.setPointerCapture(e.pointerId);
        resizeDirRef.current = dir;
        resizeRef.current = { px: e.clientX, py: e.clientY, ow: size.w, oh: size.h };
      },
      onPointerMove(e: React.PointerEvent) {
        if (!resizeRef.current) return;
        const dx = e.clientX - resizeRef.current.px;
        const dy = e.clientY - resizeRef.current.py;
        setSize({
          w: dir === "s" ? size.w : Math.max(380, resizeRef.current.ow + dx),
          h: dir === "e" ? size.h : Math.max(300, resizeRef.current.oh + dy),
        });
      },
      onPointerUp() { resizeRef.current = null; },
    };
  }

  if (!mounted) return null;

  return createPortal(
    <div
      ref={modalRef}
      tabIndex={-1}
      className="fixed z-[9999] flex flex-col rounded-xl border border-rose-900/30 shadow-2xl bg-white overflow-hidden outline-none"
      style={{ left: pos.x, top: pos.y, width: size.w, height: size.h }}
      onKeyDown={onKeyDown}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {/* Title bar — drag handle */}
      <div
        className="flex items-center gap-2 px-3 py-2.5 bg-rose-700 shrink-0 cursor-grab active:cursor-grabbing select-none"
        onPointerDown={onTitlePointerDown}
        onPointerMove={onTitlePointerMove}
        onPointerUp={onTitlePointerUp}
      >
        <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5 text-rose-200 shrink-0">
          <path d="M1.75 2.5a.25.25 0 0 0-.25.25v8.5c0 .138.112.25.25.25h.94l6.077-6.077a1.75 1.75 0 0 1 2.474 0l2.159 2.158V5.25a.25.25 0 0 0-.25-.25H10a.75.75 0 0 1 0-1.5h4A1.75 1.75 0 0 1 15.75 5.25v8.5A1.75 1.75 0 0 1 14 15.5H2A1.75 1.75 0 0 1 .25 13.75v-9A1.75 1.75 0 0 1 2 3h.5a.75.75 0 0 1 0 1.5H2a.25.25 0 0 0-.25.25Z"/>
        </svg>
        <span className="text-xs font-semibold text-white flex-1">Media Library</span>
        <span className="text-[10px] text-rose-200">Click an image to insert it</span>
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={onClose}
          className="ml-2 p-1 rounded text-rose-200 hover:text-white hover:bg-rose-800 transition-colors"
          title="Close (Esc)"
        >
          <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
            <path d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.749.749 0 0 1 1.06 1.06L9.06 8l3.22 3.22a.749.749 0 0 1-1.06 1.06L8 9.06l-3.22 3.22a.749.749 0 0 1-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06Z"/>
          </svg>
        </button>
      </div>

      {/* Picker content */}
      <div className="flex-1 overflow-hidden">
        <DamPicker
          apiBase="/api/dam"
          token={token}
          username={usernameFromToken(token)}
          onSelect={(asset) => { onSelect(asset); onClose(); }}
          filter={(a) => a.asset_type.startsWith("image/")}
        />
      </div>

      {/* Right edge — horizontal resize */}
      <div
        className="absolute top-8 bottom-4 right-0 w-2 cursor-ew-resize hover:bg-rose-400/30 transition-colors z-10"
        {...makeResizeHandlers("e")}
      />
      {/* Bottom edge — vertical resize */}
      <div
        className="absolute left-4 right-4 bottom-0 h-2 cursor-ns-resize hover:bg-rose-400/30 transition-colors z-10"
        {...makeResizeHandlers("s")}
      />
      {/* Bottom-right corner — both */}
      <div
        className="absolute bottom-0 right-0 w-5 h-5 cursor-nwse-resize flex items-end justify-end pb-1 pr-1 opacity-40 hover:opacity-90 transition-opacity z-20"
        {...makeResizeHandlers("se")}
      >
        <svg viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="w-3 h-3 text-slate-400">
          <path d="M9 3 L3 9 M9 6 L6 9 M9 9"/>
        </svg>
      </div>
    </div>,
    document.body
  );
}
