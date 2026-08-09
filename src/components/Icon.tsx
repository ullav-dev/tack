"use client";

/** Shared 16x16 stroke-icon system, factored out of NoteThread.tsx (its
 * original home) so NoteTree.tsx can reuse the exact same edit/delete
 * glyphs instead of the "✎"/"×" text-glyph placeholders an earlier pass
 * used -- a first, small, concrete step toward this app's "build for
 * reuse" convention (see this repo's CLAUDE.md), not a full package
 * extraction. Icons specific to one screen (e.g. NoteThread's export/print
 * icons) stay defined locally in that file; only ones actually shared move
 * here. */
export function Icon({ children }: { children: React.ReactNode }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" className="w-4 h-4">
      {children}
    </svg>
  );
}

// Same w-6/h-6 icon-button shape as MarkdownToolbar/EditorToolbar, so these
// read as the same family of control rather than a one-off.
export function IconButton({
  title,
  onClick,
  disabled,
  danger,
  children,
}: {
  title: string;
  // Takes the click event (existing zero-arg callers stay valid -- a
  // function that ignores its argument is assignable here) so a caller
  // nested inside a wrapping <Link> or <form>, like Navigator's "view in
  // folder" button, can stopPropagation()/preventDefault() to avoid
  // triggering the ancestor's own click behavior.
  onClick: (e: React.MouseEvent) => void;
  disabled?: boolean;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      disabled={disabled}
      className={`w-6 h-6 rounded flex items-center justify-center transition-colors disabled:opacity-40 print:hidden ${
        danger ? "text-slate-400 hover:text-red-600 hover:bg-red-50" : "text-slate-400 hover:text-rose-700 hover:bg-slate-100"
      }`}
    >
      {children}
    </button>
  );
}

export const editIcon = (
  <Icon>
    <path d="M10.5 2.5 13.5 5.5 5.5 13.5H2.5v-3L10.5 2.5Z" strokeLinejoin="round" />
  </Icon>
);

export const deleteIcon = (
  <Icon>
    <path d="M3 4.5h10M6 4.5V3a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v1.5" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M4.5 4.5 5 13a1 1 0 0 0 1 1h4a1 1 0 0 0 1-1l.5-8.5" strokeLinecap="round" strokeLinejoin="round" />
  </Icon>
);

export const plusIcon = (
  <Icon>
    <path d="M8 3.5v9M3.5 8h9" strokeLinecap="round" />
  </Icon>
);

/** Closed folder -- NoteTree's folder rows. */
export const folderIcon = (
  <Icon>
    <path d="M2 4.2a.8.8 0 0 1 .8-.8h3l1.2 1.5h6.2a.8.8 0 0 1 .8.8v6.3a.8.8 0 0 1-.8.8H2.8a.8.8 0 0 1-.8-.8V4.2Z" strokeLinejoin="round" />
  </Icon>
);

/** Open folder -- NoteTree's expanded folder rows (distinguishes expanded
 * from collapsed at a glance, on top of the ▾/▸ toggle). */
export const folderOpenIcon = (
  <Icon>
    <path d="M2 4.2a.8.8 0 0 1 .8-.8h3l1.2 1.5h5.2a.8.8 0 0 1 .8.8v.7H3.6a.8.8 0 0 0-.77.6L1.7 11.5" strokeLinejoin="round" strokeLinecap="round" />
    <path d="M1.7 11.5 3 6.9a.8.8 0 0 1 .77-.58h9.1a.8.8 0 0 1 .77 1.01l-1.2 4.2a.8.8 0 0 1-.77.58H2.47a.8.8 0 0 1-.77-1.01Z" strokeLinejoin="round" />
  </Icon>
);

/** A single note -- NoteTree's leaf rows. Plain flat-cornered document + a
 * couple of text-line strokes. */
export const noteIcon = (
  <Icon>
    <path d="M4 2.5h6l2 2v8.5a.5.5 0 0 1-.5.5h-7.5a.5.5 0 0 1-.5-.5v-10a.5.5 0 0 1 .5-.5Z" strokeLinejoin="round" />
    <path d="M5.8 7.2h4.4M5.8 9.4h4.4" strokeLinecap="round" />
  </Icon>
);

/** A single page -- PageTree's leaf/branch rows (a page can have child
 * pages *and* still be a document in its own right, unlike a Notes folder,
 * which is purely a container -- so this always renders next to a page's
 * own chevron when it has children, it never replaces it with a folder
 * icon the way a Space or a Notes folder does). Folded top-right corner
 * distinguishes it from `noteIcon`'s plain rectangle at a glance. */
export const pageIcon = (
  <Icon>
    <path d="M4 2.5h5.5L12 5v8.5a.5.5 0 0 1-.5.5h-7a.5.5 0 0 1-.5-.5v-11a.5.5 0 0 1 .5-.5Z" strokeLinejoin="round" />
    <path d="M9.5 2.5v2.5h2.5" strokeLinejoin="round" />
  </Icon>
);
