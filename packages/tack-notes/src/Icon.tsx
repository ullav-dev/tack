"use client";

/** Shared 16x16 stroke-icon system, extracted verbatim from `tack`'s own
 * `Icon.tsx` (only the icons Notes actually uses -- `pageIcon` stayed
 * behind, it's Pages-only). */
export function Icon({ children }: { children: React.ReactNode }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" className="w-4 h-4">
      {children}
    </svg>
  );
}

/** `danger` uses a plain semantic red (a warning color, not brand-specific,
 * consistent across every first-party app already) -- only the non-danger
 * hover state is tokenized to the host app's accent color. See this
 * package's README for the `--tnotes-*` CSS variable contract. */
export function IconButton({
  title,
  onClick,
  disabled,
  danger,
  children,
}: {
  title: string;
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
        danger
          ? "text-slate-400 hover:text-red-600 hover:bg-red-50"
          : "text-slate-400 hover:text-[var(--tnotes-700,#be123c)] hover:bg-slate-100"
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

/** Closed folder -- `TackNoteTree`'s folder rows. */
export const folderIcon = (
  <Icon>
    <path d="M2 4.2a.8.8 0 0 1 .8-.8h3l1.2 1.5h6.2a.8.8 0 0 1 .8.8v6.3a.8.8 0 0 1-.8.8H2.8a.8.8 0 0 1-.8-.8V4.2Z" strokeLinejoin="round" />
  </Icon>
);

/** Open folder -- `TackNoteTree`'s expanded folder rows. */
export const folderOpenIcon = (
  <Icon>
    <path d="M2 4.2a.8.8 0 0 1 .8-.8h3l1.2 1.5h5.2a.8.8 0 0 1 .8.8v.7H3.6a.8.8 0 0 0-.77.6L1.7 11.5" strokeLinejoin="round" strokeLinecap="round" />
    <path d="M1.7 11.5 3 6.9a.8.8 0 0 1 .77-.58h9.1a.8.8 0 0 1 .77 1.01l-1.2 4.2a.8.8 0 0 1-.77.58H2.47a.8.8 0 0 1-.77-1.01Z" strokeLinejoin="round" />
  </Icon>
);

/** A single note -- `TackNoteTree`'s leaf rows. */
export const noteIcon = (
  <Icon>
    <path d="M4 2.5h6l2 2v8.5a.5.5 0 0 1-.5.5h-7.5a.5.5 0 0 1-.5-.5v-10a.5.5 0 0 1 .5-.5Z" strokeLinejoin="round" />
    <path d="M5.8 7.2h4.4M5.8 9.4h4.4" strokeLinecap="round" />
  </Icon>
);
