"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { useAuth } from "@/contexts/AuthContext";
import { listPages, type Page } from "@/lib/tack-server-api";

/** Root pages in a space — a minimal placeholder list for now. Phase F2
 * replaces this with the real lazy-loaded hierarchical tree in the
 * Navigator; this route-level view stays as a plain "root pages" index. */
export default function SpacePagesPage() {
  const { spaceId } = useParams<{ spaceId: string }>();
  const { token } = useAuth();
  const t = useTranslations("navigator");
  const [pages, setPages] = useState<Page[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    listPages(token, spaceId)
      .then((p) => {
        if (!cancelled) setPages(p);
      })
      .catch((e) => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [token, spaceId]);

  return (
    <div className="p-6">
      {error && <p className="text-red-600">{error}</p>}
      {!pages && !error && <p className="text-slate-400">{t("loading")}</p>}
      {pages && pages.length === 0 && <p className="text-slate-400">{t("noPages")}</p>}
      <ul className="space-y-1">
        {pages?.map((page) => (
          <li key={page.id}>
            <Link
              href={`/spaces/${spaceId}/pages/${page.id}`}
              className="text-rose-700 hover:underline"
            >
              {page.title}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
