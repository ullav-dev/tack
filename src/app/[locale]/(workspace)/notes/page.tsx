"use client";

import { useTranslations } from "next-intl";

/** Landing view for the workspace when no note is selected yet -- mirrors
 * SpacesLandingPage exactly. The Navigator (left panel) is where a note is
 * actually picked or created; this replaces an F1-era placeholder that
 * duplicated that list in the main panel as a plain, unstyled link list
 * (its own body_markdown text rendered as the link label), which read as
 * a stray, confusing second notes list rather than the intended landing
 * state. */
export default function NotesLandingPage() {
  const t = useTranslations("navigator");
  return (
    <div className="h-full flex items-center justify-center text-slate-400">
      <p>{t("selectNote")}</p>
    </div>
  );
}
