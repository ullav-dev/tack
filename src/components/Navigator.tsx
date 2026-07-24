"use client";

// Minimal placeholder for the workspace's left-hand Navigator — proves the
// (workspace) shell/routing/API wiring end-to-end. Phase F2 replaces this
// with the real lazy-loaded Space/Page tree, paginated Notes list, and
// search box (see the Tack frontend implementation plan).

import { useEffect, useState } from "react";
import { Link } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { useAuth } from "@/contexts/AuthContext";
import { listSpaces, type Space } from "@/lib/tack-server-api";

export default function Navigator() {
  const { token } = useAuth();
  const t = useTranslations("navigator");
  const [spaces, setSpaces] = useState<Space[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    listSpaces(token)
      .then((s) => {
        if (!cancelled) setSpaces(s);
      })
      .catch((e) => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  return (
    <nav className="h-full flex flex-col text-sm border-r border-slate-200 bg-white">
      <div className="px-4 py-3 border-b border-slate-200">
        <Link href="/notes" className="block font-medium text-slate-700 hover:text-rose-700">
          {t("notes")}
        </Link>
      </div>
      <div className="px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
        {t("spaces")}
      </div>
      <div className="flex-1 overflow-y-auto px-2 pb-4">
        {error && <p className="px-2 text-red-600">{error}</p>}
        {!spaces && !error && <p className="px-2 text-slate-400">{t("loading")}</p>}
        {spaces && spaces.length === 0 && <p className="px-2 text-slate-400">{t("noSpaces")}</p>}
        {spaces?.map((space) => (
          <Link
            key={space.id}
            href={`/spaces/${space.id}/pages`}
            className="block rounded px-2 py-1.5 text-slate-700 hover:bg-slate-100"
          >
            {space.name}
          </Link>
        ))}
      </div>
    </nav>
  );
}
