"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import NoteMarkdown from "@/components/NoteMarkdown";
import MarkdownToolbar from "@/components/MarkdownToolbar";

interface Props {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  rows?: number;
}

/** Plain markdown textarea (with a formatting toolbar and a live preview
 * toggle) — Notes are markdown-only, single-writer (no live collaboration,
 * unlike Pages' TipTap/Yjs editor), so a request/response textarea is the
 * correct model here, not a rich WYSIWYG surface. The toolbar exists
 * because most people don't know or remember markdown syntax -- the same
 * "an editing surface needs a visible formatting affordance" reasoning as
 * Pages' `EditorToolbar`. */
export default function MarkdownComposer({ value, onChange, placeholder, disabled, rows = 5 }: Props) {
  const [previewing, setPreviewing] = useState(false);
  const t = useTranslations("notes");
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
          <MarkdownToolbar textareaRef={textareaRef} value={value} onChange={onChange} disabled={disabled} />
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            disabled={disabled}
            rows={rows}
            className="w-full rounded-b border border-slate-200 px-3 py-2 text-sm font-mono focus:border-rose-400 focus:outline-none focus:ring-1 focus:ring-rose-400"
          />
        </div>
      )}
    </div>
  );
}
