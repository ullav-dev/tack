"use client";

import type { Editor } from "@tiptap/react";
import { useEditorState } from "@tiptap/react";

interface Props {
  editor: Editor | null;
}

interface ButtonSpec {
  label: string;
  title: string;
  active: boolean;
  onClick: () => void;
}

function Icon({ children }: { children: React.ReactNode }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" className="w-4 h-4">
      {children}
    </svg>
  );
}

const icons = {
  bold: (
    <Icon>
      <path
        d="M4.5 2.5h4a2.5 2.5 0 0 1 0 5h-4v-5Zm0 5h4.5a2.5 2.5 0 0 1 0 5h-4.5v-5Z"
        strokeLinejoin="round"
        fill="currentColor"
        stroke="none"
      />
    </Icon>
  ),
  italic: (
    <Icon>
      <path d="M7 2.5h5M4 13.5h5M9.5 2.5l-3 11" strokeLinecap="round" />
    </Icon>
  ),
  bulletList: (
    <Icon>
      <circle cx="2.5" cy="4" r="1" fill="currentColor" stroke="none" />
      <circle cx="2.5" cy="8" r="1" fill="currentColor" stroke="none" />
      <circle cx="2.5" cy="12" r="1" fill="currentColor" stroke="none" />
      <path d="M5.5 4h8M5.5 8h8M5.5 12h8" strokeLinecap="round" />
    </Icon>
  ),
  orderedList: (
    <Icon>
      <path d="M5.5 4h8M5.5 8h8M5.5 12h8" strokeLinecap="round" />
      <text x="1" y="5.2" fontSize="4.2" fill="currentColor" stroke="none">
        1
      </text>
      <text x="1" y="9.2" fontSize="4.2" fill="currentColor" stroke="none">
        2
      </text>
      <text x="1" y="13.2" fontSize="4.2" fill="currentColor" stroke="none">
        3
      </text>
    </Icon>
  ),
  quote: (
    <Icon>
      <path
        d="M4 5.5c-1.1 0-2 .9-2 2v1.5h2.5V11H3v-1.5c0-1.1.9-2 2-2V5.5H4Zm7 0c-1.1 0-2 .9-2 2v1.5h2.5V11H10v-1.5c0-1.1.9-2 2-2V5.5h-1Z"
        fill="currentColor"
        stroke="none"
      />
    </Icon>
  ),
  code: (
    <Icon>
      <path d="M5 4.5 2 8l3 3.5M11 4.5 14 8l-3 3.5" strokeLinecap="round" strokeLinejoin="round" />
    </Icon>
  ),
  table: (
    <Icon>
      <rect x="2" y="3" width="12" height="10" rx="1" />
      <path d="M2 7h12M6.5 3v10" />
    </Icon>
  ),
  rows: (
    <Icon>
      <rect x="2" y="3" width="12" height="10" rx="1" />
      <path d="M2 8h12" />
    </Icon>
  ),
  columns: (
    <Icon>
      <rect x="2" y="3" width="12" height="10" rx="1" />
      <path d="M8 3v10" />
    </Icon>
  ),
  plus: (
    <Icon>
      <path d="M8 3.5v9M3.5 8h9" strokeLinecap="round" />
    </Icon>
  ),
  minus: (
    <Icon>
      <path d="M3.5 8h9" strokeLinecap="round" />
    </Icon>
  ),
  trash: (
    <Icon>
      <path d="M3 5h10M6.5 5V3.5h3V5M4.5 5l.5 8h6l.5-8" strokeLinecap="round" strokeLinejoin="round" />
    </Icon>
  ),
  headerRow: (
    <Icon>
      <rect x="2" y="3" width="12" height="10" rx="1" />
      <path d="M2 6.5h12" />
      <rect x="2" y="3" width="12" height="3.5" fill="currentColor" fillOpacity="0.35" stroke="none" />
    </Icon>
  ),
  headerColumn: (
    <Icon>
      <rect x="2" y="3" width="12" height="10" rx="1" />
      <path d="M6 3v10" />
      <rect x="2" y="3" width="4" height="10" fill="currentColor" fillOpacity="0.35" stroke="none" />
    </Icon>
  ),
} as const;

/** Minimal fixed formatting toolbar for the Page editor — Pages are a
 * WYSIWYG editor (typing "## " converts a line to a heading and consumes
 * the trigger text, the same way Confluence/Notion behave), so without
 * some visible affordance, formatting is only discoverable via those
 * typed shortcuts. This does not attempt to be a full toolbar (no
 * link/image/color pickers yet) — just the essentials plus table insertion. */
export default function EditorToolbar({ editor }: Props) {
  // `useEditorState` (not plain `editor.isActive(...)` calls in render) is
  // what makes button highlighting react to selection/content changes --
  // TipTap's `editor` instance doesn't itself trigger React re-renders.
  const activeState = useEditorState({
    editor,
    selector: (ctx) =>
      ctx.editor
        ? {
            bold: ctx.editor.isActive("bold"),
            italic: ctx.editor.isActive("italic"),
            h1: ctx.editor.isActive("heading", { level: 1 }),
            h2: ctx.editor.isActive("heading", { level: 2 }),
            h3: ctx.editor.isActive("heading", { level: 3 }),
            bulletList: ctx.editor.isActive("bulletList"),
            orderedList: ctx.editor.isActive("orderedList"),
            blockquote: ctx.editor.isActive("blockquote"),
            codeBlock: ctx.editor.isActive("codeBlock"),
            inTable: ctx.editor.isActive("table"),
            inHeaderCell: ctx.editor.isActive("tableHeader"),
          }
        : null,
  });

  if (!editor || !activeState) return null;

  const buttons: ButtonSpec[] = [
    { label: "Bold", title: "Bold", active: activeState.bold, onClick: () => editor.chain().focus().toggleBold().run() },
    {
      label: "Italic",
      title: "Italic",
      active: activeState.italic,
      onClick: () => editor.chain().focus().toggleItalic().run(),
    },
    {
      label: "H1",
      title: "Heading 1",
      active: activeState.h1,
      onClick: () => editor.chain().focus().toggleHeading({ level: 1 }).run(),
    },
    {
      label: "H2",
      title: "Heading 2",
      active: activeState.h2,
      onClick: () => editor.chain().focus().toggleHeading({ level: 2 }).run(),
    },
    {
      label: "H3",
      title: "Heading 3",
      active: activeState.h3,
      onClick: () => editor.chain().focus().toggleHeading({ level: 3 }).run(),
    },
    {
      label: "Bullet list",
      title: "Bullet list",
      active: activeState.bulletList,
      onClick: () => editor.chain().focus().toggleBulletList().run(),
    },
    {
      label: "Ordered list",
      title: "Ordered list",
      active: activeState.orderedList,
      onClick: () => editor.chain().focus().toggleOrderedList().run(),
    },
    {
      label: "Blockquote",
      title: "Blockquote",
      active: activeState.blockquote,
      onClick: () => editor.chain().focus().toggleBlockquote().run(),
    },
    {
      label: "Code block",
      title: "Code block",
      active: activeState.codeBlock,
      onClick: () => editor.chain().focus().toggleCodeBlock().run(),
    },
  ];

  // H1-H3 render as plain text labels (below) rather than icons -- a glyph
  // for "heading level" doesn't read as clearly as the digit itself does.
  const iconFor: Record<string, keyof typeof icons> = {
    Bold: "bold",
    Italic: "italic",
    "Bullet list": "bulletList",
    "Ordered list": "orderedList",
    Blockquote: "quote",
    "Code block": "code",
  };

  return (
    <div className="border-b border-slate-200 shrink-0 bg-slate-50/60">
      <div className="flex items-center gap-1 px-4 py-1.5">
        {buttons.map((b) =>
          b.label === "H1" || b.label === "H2" || b.label === "H3" ? (
            <button
              key={b.title}
              type="button"
              title={b.title}
              onClick={b.onClick}
              className={`h-7 px-2 rounded text-xs font-bold ${
                b.active ? "bg-rose-100 text-rose-700" : "text-slate-600 hover:bg-slate-200/70"
              }`}
            >
              {b.label}
            </button>
          ) : (
            <button
              key={b.title}
              type="button"
              title={b.title}
              onClick={b.onClick}
              className={`w-7 h-7 rounded flex items-center justify-center ${
                b.active ? "bg-rose-100 text-rose-700" : "text-slate-600 hover:bg-slate-200/70"
              }`}
            >
              {icons[iconFor[b.label]]}
            </button>
          )
        )}

        <div className="w-px h-5 bg-slate-200 mx-1" />

        <button
          type="button"
          title="Insert table"
          onClick={() => editor.chain().focus().insertTable({ rows: 2, cols: 2, withHeaderRow: true }).run()}
          className="w-7 h-7 rounded flex items-center justify-center text-slate-600 hover:bg-slate-200/70"
        >
          {icons.table}
        </button>
      </div>

      {activeState.inTable && (
        <div className="flex items-center gap-3 px-4 pb-2">
          <div className="flex items-center gap-0.5 rounded-md border border-slate-200 bg-white overflow-hidden">
            <span className="flex items-center justify-center w-6 h-6 text-slate-400">{icons.rows}</span>
            <button
              type="button"
              title="Add row below"
              onClick={() => editor.chain().focus().addRowAfter().run()}
              className="w-6 h-6 flex items-center justify-center text-slate-500 hover:bg-slate-100 border-l border-slate-200"
            >
              {icons.plus}
            </button>
            <button
              type="button"
              title="Delete row"
              onClick={() => editor.chain().focus().deleteRow().run()}
              className="w-6 h-6 flex items-center justify-center text-slate-500 hover:bg-slate-100 border-l border-slate-200"
            >
              {icons.minus}
            </button>
          </div>

          <div className="flex items-center gap-0.5 rounded-md border border-slate-200 bg-white overflow-hidden">
            <span className="flex items-center justify-center w-6 h-6 text-slate-400">{icons.columns}</span>
            <button
              type="button"
              title="Add column after"
              onClick={() => editor.chain().focus().addColumnAfter().run()}
              className="w-6 h-6 flex items-center justify-center text-slate-500 hover:bg-slate-100 border-l border-slate-200"
            >
              {icons.plus}
            </button>
            <button
              type="button"
              title="Delete column"
              onClick={() => editor.chain().focus().deleteColumn().run()}
              className="w-6 h-6 flex items-center justify-center text-slate-500 hover:bg-slate-100 border-l border-slate-200"
            >
              {icons.minus}
            </button>
          </div>

          <div className="flex items-center gap-0.5">
            <button
              type="button"
              title="Toggle header row"
              onClick={() => editor.chain().focus().toggleHeaderRow().run()}
              className={`w-6 h-6 flex items-center justify-center rounded-md ${
                activeState.inHeaderCell ? "bg-rose-100 text-rose-700" : "text-slate-500 hover:bg-slate-100"
              }`}
            >
              {icons.headerRow}
            </button>
            <button
              type="button"
              title="Toggle header column"
              onClick={() => editor.chain().focus().toggleHeaderColumn().run()}
              className={`w-6 h-6 flex items-center justify-center rounded-md ${
                activeState.inHeaderCell ? "bg-rose-100 text-rose-700" : "text-slate-500 hover:bg-slate-100"
              }`}
            >
              {icons.headerColumn}
            </button>
          </div>

          <button
            type="button"
            title="Delete table"
            onClick={() => editor.chain().focus().deleteTable().run()}
            className="flex items-center justify-center w-6 h-6 rounded-md text-rose-500 hover:bg-rose-50"
          >
            {icons.trash}
          </button>
        </div>
      )}
    </div>
  );
}
