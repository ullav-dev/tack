"use client";

import type { TFunction } from "./types";

interface Props {
  /** 1-indexed current page. */
  page: number;
  totalPages: number;
  onChange: (page: number) => void;
  disabled?: boolean;
  /** Calls `t("pagerPrev")`, `t("pagerNext")`, `t("pagerPageOf", { page, total })`. */
  t: TFunction;
}

/** Prev/next + "Page N of M" -- extracted verbatim from `tack`'s own
 * `Pager.tsx`. Renders nothing when there's only one page. */
export default function Pager({ page, totalPages, onChange, disabled, t }: Props) {
  if (totalPages <= 1) return null;
  return (
    <div className="flex items-center justify-between gap-2 px-2 py-1 text-xs text-slate-400">
      <button
        type="button"
        onClick={() => onChange(page - 1)}
        disabled={disabled || page <= 1}
        className="font-medium text-[var(--tnotes-700,#be123c)] hover:underline disabled:text-slate-300 disabled:hover:no-underline disabled:cursor-not-allowed"
      >
        ‹ {t("pagerPrev")}
      </button>
      <span>{t("pagerPageOf", { page, total: totalPages })}</span>
      <button
        type="button"
        onClick={() => onChange(page + 1)}
        disabled={disabled || page >= totalPages}
        className="font-medium text-[var(--tnotes-700,#be123c)] hover:underline disabled:text-slate-300 disabled:hover:no-underline disabled:cursor-not-allowed"
      >
        {t("pagerNext")} ›
      </button>
    </div>
  );
}
