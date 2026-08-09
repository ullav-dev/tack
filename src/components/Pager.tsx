"use client";

import { useTranslations } from "next-intl";

interface Props {
  /** 1-indexed current page. */
  page: number;
  totalPages: number;
  onChange: (page: number) => void;
  disabled?: boolean;
}

/** Prev/next + "Page N of M" -- the same shape
 * `cunav/src/app/[locale]/(protected)/tickets/page.tsx` already uses for a
 * list panel, not the wider ellipsis-windowed numbered-button pattern
 * `clann-webapp/family/page.tsx` uses (built for a wide main-content table,
 * not a ~300px sidebar). Shared by NoteTree, PageTree, and Navigator's
 * Spaces list -- the one piece of UI all three needed identically, so it's
 * a real component instead of three copies of the same JSX. Renders
 * nothing when there's only one page, so an unpaginated-in-practice list
 * doesn't grow a dead control. */
export default function Pager({ page, totalPages, onChange, disabled }: Props) {
  const t = useTranslations("navigator");
  if (totalPages <= 1) return null;
  return (
    <div className="flex items-center justify-between gap-2 px-2 py-1 text-xs text-slate-400">
      <button
        type="button"
        onClick={() => onChange(page - 1)}
        disabled={disabled || page <= 1}
        className="font-medium text-rose-700 hover:underline disabled:text-slate-300 disabled:hover:no-underline disabled:cursor-not-allowed"
      >
        ‹ {t("pagerPrev")}
      </button>
      <span>{t("pagerPageOf", { page, total: totalPages })}</span>
      <button
        type="button"
        onClick={() => onChange(page + 1)}
        disabled={disabled || page >= totalPages}
        className="font-medium text-rose-700 hover:underline disabled:text-slate-300 disabled:hover:no-underline disabled:cursor-not-allowed"
      >
        {t("pagerNext")} ›
      </button>
    </div>
  );
}
