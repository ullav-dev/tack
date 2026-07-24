"use client";

import { useTranslations } from "next-intl";

/** Landing view for a space when no specific page is selected yet — the
 * Navigator's PageTree (left panel) is where pages are actually browsed,
 * expanded, and picked (see PageTree.tsx, built in Phase F2). */
export default function SpacePagesPage() {
  const t = useTranslations("navigator");
  return (
    <div className="h-full flex items-center justify-center text-slate-400">
      <p>{t("selectPage")}</p>
    </div>
  );
}
