"use client";

import { useTranslations } from "next-intl";

/** Landing view for the workspace when no space is selected yet. The
 * Navigator (left panel) is where a space is actually picked or created —
 * see Phase F2 for the real Space list/create flow. */
export default function SpacesLandingPage() {
  const t = useTranslations("navigator");
  return (
    <div className="h-full flex items-center justify-center text-slate-400">
      <p>{t("selectSpace")}</p>
    </div>
  );
}
