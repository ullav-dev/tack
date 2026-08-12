"use client";

import { useRef, useState, type ComponentType } from "react";
import NoteMarkdown from "./NoteMarkdown";
import MarkdownToolbar from "./MarkdownToolbar";
import type { TFunction } from "./types";

interface Props {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  rows?: number;
  /** Calls `t("write")`, `t("preview")`, `t("nothingToPreview")`. */
  t: TFunction;
  ImagePicker?: ComponentType<{ onSelect: (asset: { url: string; name: string }) => void; onClose: () => void }>;
}

/** Plain markdown textarea (with a formatting toolbar and a live preview
 * toggle) -- extracted verbatim from `tack`'s own `MarkdownComposer.tsx`. */
export default function MarkdownComposer({ value, onChange, placeholder, disabled, rows = 5, t, ImagePicker }: Props) {
  const [previewing, setPreviewing] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  return (
    <div>
      <div className="flex items-center gap-2 mb-1">
        <button
          type="button"
          onClick={() => setPreviewing(false)}
          className={`text-xs px-2 py-0.5 rounded ${!previewing ? "bg-slate-200 text-slate-700" : "text-slate-400 hover:text-slate-600"}`}
        >
          {t("write")}
        </button>
        <button
          type="button"
          onClick={() => setPreviewing(true)}
          className={`text-xs px-2 py-0.5 rounded ${previewing ? "bg-slate-200 text-slate-700" : "text-slate-400 hover:text-slate-600"}`}
        >
          {t("preview")}
        </button>
      </div>
      {previewing ? (
        <div className="min-h-[6rem] rounded border border-slate-200 px-3 py-2">
          {value.trim() ? <NoteMarkdown body={value} /> : <p className="text-sm text-slate-400">{t("nothingToPreview")}</p>}
        </div>
      ) : (
        <div>
          <MarkdownToolbar textareaRef={textareaRef} value={value} onChange={onChange} disabled={disabled} ImagePicker={ImagePicker} />
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            disabled={disabled}
            rows={rows}
            className="box-border w-full rounded-b border border-slate-200 px-3 py-2 text-sm font-mono focus:border-[var(--tnotes-400,#fb7185)] focus:outline-none focus:ring-1 focus:ring-[var(--tnotes-400,#fb7185)]"
          />
        </div>
      )}
    </div>
  );
}
