"use client";

import type { TFunction } from "./types";

interface Props {
  version: number;
  onConfirm: () => void;
  onCancel: () => void;
  /** Calls `t("exportOldVersionConfirmTitle")`,
   * `t("exportOldVersionConfirmBody", { n })`, `t("deleteCancel")`,
   * `t("exportOldVersionConfirm")`. */
  t: TFunction;
}

/** Confirms exporting a note while browsing a historical (not latest)
 * version -- extracted verbatim from `tack`'s own
 * `ConfirmExportOldVersionModal.tsx`. */
export default function ConfirmExportOldVersionModal({ version, onConfirm, onCancel, t }: Props) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 print:hidden" onClick={onCancel}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <h2 className="text-base font-semibold text-slate-800">{t("exportOldVersionConfirmTitle")}</h2>
          <button
            type="button"
            onClick={onCancel}
            className="text-slate-400 hover:text-slate-600 transition-colors"
            aria-label="Close"
          >
            <svg viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4">
              <path d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.75.75 0 1 1 1.06 1.06L9.06 8l3.22 3.22a.75.75 0 1 1-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 0 1-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06z" />
            </svg>
          </button>
        </div>

        <div className="px-6 py-5 space-y-3">
          <p className="text-sm text-slate-600">{t("exportOldVersionConfirmBody", { n: version })}</p>
        </div>

        <div className="flex justify-end gap-3 px-6 py-4 border-t border-slate-200">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
          >
            {t("deleteCancel")}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="px-4 py-2 text-sm font-medium bg-[var(--tnotes-700,#be123c)] hover:bg-[var(--tnotes-800,#9f1239)] text-white rounded-lg transition-colors"
          >
            {t("exportOldVersionConfirm")}
          </button>
        </div>
      </div>
    </div>
  );
}
