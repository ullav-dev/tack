"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

interface Props {
  onConfirm: () => Promise<void>;
  onCancel: () => void;
}

/** Confirmation dialog for deleting a note -- same modal shell/styling as
 * `MyDetailsModal` (the org's established in-app dialog pattern), not
 * `window.confirm`, so a destructive action that also cascades to every
 * saved version and reply gets a properly themed, explicit warning rather
 * than a generic browser prompt. */
export default function DeleteNoteModal({ onConfirm, onCancel }: Props) {
  const t = useTranslations("notes");
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleConfirm() {
    setDeleting(true);
    setError(null);
    try {
      await onConfirm();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete");
      setDeleting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onCancel}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <h2 className="text-base font-semibold text-slate-800">{t("deleteNoteConfirmTitle")}</h2>
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
          <p className="text-sm text-slate-600">{t("deleteNoteConfirmBody")}</p>
          {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
        </div>

        <div className="flex justify-end gap-3 px-6 py-4 border-t border-slate-200">
          <button
            type="button"
            onClick={onCancel}
            disabled={deleting}
            className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors disabled:opacity-50"
          >
            {t("deleteCancel")}
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={deleting}
            className="px-4 py-2 text-sm font-medium bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors disabled:opacity-60"
          >
            {deleting ? t("saving") : t("deleteNote")}
          </button>
        </div>
      </div>
    </div>
  );
}
