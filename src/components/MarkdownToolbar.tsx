"use client";

import { useState, type RefObject } from "react";
import type { PickedAsset } from "@ullav/dam-picker";
import { useAuth } from "@/contexts/AuthContext";
import DamPickerModal from "@/components/DamPickerModal";

interface Props {
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

interface Transform {
  next: string;
  selStart: number;
  selEnd: number;
}

function wrapSelection(el: HTMLTextAreaElement, value: string, before: string, after: string): Transform {
  const start = el.selectionStart;
  const end = el.selectionEnd;
  const selected = value.slice(start, end);
  const next = value.slice(0, start) + before + selected + after + value.slice(end);
  return { next, selStart: start + before.length, selEnd: start + before.length + selected.length };
}

function prefixLine(el: HTMLTextAreaElement, value: string, prefix: string): Transform {
  const start = el.selectionStart;
  const lineStart = value.lastIndexOf("\n", start - 1) + 1;
  const next = value.slice(0, lineStart) + prefix + value.slice(lineStart);
  return { next, selStart: start + prefix.length, selEnd: el.selectionEnd + prefix.length };
}

// Same cursor-insertion shape as togra's StickyCard.insertAsset -- pads
// with a blank line on either side only where the surrounding text isn't
// already at a line boundary, so the image snippet doesn't run into
// adjacent prose.
function insertSnippet(el: HTMLTextAreaElement, value: string, snippet: string): Transform {
  const pos = el.selectionStart;
  const before = value.slice(0, pos);
  const after = value.slice(pos);
  const prefix = before.length > 0 && !before.endsWith("\n") ? "\n\n" : "";
  const suffix = after.length > 0 && !after.startsWith("\n") ? "\n\n" : "";
  const next = before + prefix + snippet + suffix + after;
  const selStart = (before + prefix + snippet).length;
  return { next, selStart, selEnd: selStart };
}

function Icon({ children }: { children: React.ReactNode }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" className="w-3.5 h-3.5">
      {children}
    </svg>
  );
}

/** Most people don't know (or remember) markdown syntax, so a plain
 * textarea with no visible formatting affordance isn't a real editing
 * surface for them -- same reasoning as Pages' `EditorToolbar`, applied to
 * a plain textarea instead of a TipTap `Editor` instance. Manipulates the
 * textarea's selection directly (wrap/prefix), then restores focus and
 * selection on the next frame, since updating `value` via `onChange`
 * doesn't happen synchronously.
 *
 * "Insert image" opens `DamPickerModal` (Tack's own copy of togra's
 * `@ullav/dam-picker`) and inserts a plain markdown image link at the
 * cursor, same as the other buttons here. */
export default function MarkdownToolbar({ textareaRef, value, onChange, disabled }: Props) {
  const { token } = useAuth();
  const [showDamPicker, setShowDamPicker] = useState(false);

  function apply(transform: (el: HTMLTextAreaElement, value: string) => Transform) {
    const el = textareaRef.current;
    if (!el || disabled) return;
    const { next, selStart, selEnd } = transform(el, value);
    onChange(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(selStart, selEnd);
    });
  }

  // Mirrors togra StickyCard's insertAsset: always embeds the thumbnail
  // URL, not the full asset -- ullav-dam-server serves both
  // `/assets/:id/thumbnail` and `/assets/:id/download` with no auth
  // required (verified directly against the server), so this is a plain
  // markdown image link, no authenticated-fetch indirection needed.
  function insertAsset(asset: PickedAsset) {
    const url = asset.url.replace(/\/?$/, "/thumbnail");
    apply((el, v) => insertSnippet(el, v, `![${asset.name}](${url})`));
    setShowDamPicker(false);
  }

  const buttons: { title: string; icon: React.ReactNode; onClick: () => void }[] = [
    {
      title: "Bold",
      icon: (
        <Icon>
          <path
            d="M4.5 2.5h4a2.5 2.5 0 0 1 0 5h-4v-5Zm0 5h4.5a2.5 2.5 0 0 1 0 5h-4.5v-5Z"
            strokeLinejoin="round"
            fill="currentColor"
            stroke="none"
          />
        </Icon>
      ),
      onClick: () => apply((el, v) => wrapSelection(el, v, "**", "**")),
    },
    {
      title: "Italic",
      icon: (
        <Icon>
          <path d="M7 2.5h5M4 13.5h5M9.5 2.5l-3 11" strokeLinecap="round" />
        </Icon>
      ),
      onClick: () => apply((el, v) => wrapSelection(el, v, "*", "*")),
    },
    {
      title: "Heading",
      icon: (
        <span className="text-[11px] font-bold w-3.5 text-center leading-none">H</span>
      ),
      onClick: () => apply((el, v) => prefixLine(el, v, "## ")),
    },
    {
      title: "Bullet list",
      icon: (
        <Icon>
          <circle cx="2.5" cy="4" r="1" fill="currentColor" stroke="none" />
          <circle cx="2.5" cy="8" r="1" fill="currentColor" stroke="none" />
          <circle cx="2.5" cy="12" r="1" fill="currentColor" stroke="none" />
          <path d="M5.5 4h8M5.5 8h8M5.5 12h8" strokeLinecap="round" />
        </Icon>
      ),
      onClick: () => apply((el, v) => prefixLine(el, v, "- ")),
    },
    {
      title: "Ordered list",
      icon: <span className="text-[11px] font-semibold w-3.5 text-center leading-none">1.</span>,
      onClick: () => apply((el, v) => prefixLine(el, v, "1. ")),
    },
    {
      title: "Blockquote",
      icon: (
        <Icon>
          <path
            d="M4 5.5c-1.1 0-2 .9-2 2v1.5h2.5V11H3v-1.5c0-1.1.9-2 2-2V5.5H4Zm7 0c-1.1 0-2 .9-2 2v1.5h2.5V11H10v-1.5c0-1.1.9-2 2-2V5.5h-1Z"
            fill="currentColor"
            stroke="none"
          />
        </Icon>
      ),
      onClick: () => apply((el, v) => prefixLine(el, v, "> ")),
    },
    {
      title: "Code",
      icon: (
        <Icon>
          <path d="M5 4.5 2 8l3 3.5M11 4.5 14 8l-3 3.5" strokeLinecap="round" strokeLinejoin="round" />
        </Icon>
      ),
      onClick: () => apply((el, v) => wrapSelection(el, v, "`", "`")),
    },
    {
      title: "Link",
      icon: (
        <Icon>
          <path
            d="M6.5 9.5 9.5 6.5M6 4.5 7 3.5a2 2 0 0 1 2.8 2.8L8.7 7.4M10 11.5l-1 1a2 2 0 0 1-2.8-2.8l1.1-1.1"
            strokeLinecap="round"
          />
        </Icon>
      ),
      onClick: () => apply((el, v) => wrapSelection(el, v, "[", "](url)")),
    },
    {
      title: "Insert image",
      icon: (
        <Icon>
          <rect x="1.75" y="2.75" width="12.5" height="10.5" rx="1.25" />
          <circle cx="5" cy="6" r="1.1" fill="currentColor" stroke="none" />
          <path d="m2.5 11 3.5-3.5 2 2 2.5-3 3 4.5" strokeLinecap="round" strokeLinejoin="round" />
        </Icon>
      ),
      onClick: () => setShowDamPicker(true),
    },
  ];

  return (
    <div className="flex items-center gap-0.5 border border-b-0 border-slate-200 rounded-t px-1.5 py-1 bg-slate-50/60">
      {buttons.map((b) => (
        <button
          key={b.title}
          type="button"
          title={b.title}
          disabled={disabled}
          onClick={b.onClick}
          className="w-6 h-6 rounded flex items-center justify-center text-slate-500 hover:bg-slate-200/70 disabled:opacity-40"
        >
          {b.icon}
        </button>
      ))}

      {showDamPicker && token && (
        <DamPickerModal token={token} onSelect={insertAsset} onClose={() => setShowDamPicker(false)} />
      )}
    </div>
  );
}
