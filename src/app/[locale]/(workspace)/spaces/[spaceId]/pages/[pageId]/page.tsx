"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useAuth } from "@/contexts/AuthContext";
import { getPage, getPagePermission, type Page, type PermissionLevel } from "@/lib/tack-server-api";

/** Page viewer — plain read-only preview of `content_markdown` for now.
 * Phase F3 replaces this with the live TipTap+Hocuspocus collaborative
 * editor, using the same `getPagePermission` call for the read-only gate. */
export default function PageViewPage() {
  const { pageId } = useParams<{ pageId: string }>();
  const { token } = useAuth();
  const t = useTranslations("navigator");
  const [page, setPage] = useState<Page | null>(null);
  const [level, setLevel] = useState<PermissionLevel | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    Promise.all([getPage(token, pageId), getPagePermission(token, pageId)])
      .then(([p, perm]) => {
        if (cancelled) return;
        setPage(p);
        setLevel(perm.level);
      })
      .catch((e) => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [token, pageId]);

  if (error) return <p className="p-6 text-red-600">{error}</p>;
  if (!page) return <p className="p-6 text-slate-400">{t("loading")}</p>;

  return (
    <div className="p-6 max-w-3xl">
      <div className="flex items-center gap-2 mb-4">
        <h1 className="text-xl font-semibold text-slate-800">{page.title}</h1>
        {level === "view" && (
          <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">
            {t("viewOnly")}
          </span>
        )}
      </div>
      <pre className="whitespace-pre-wrap font-sans text-slate-700">{page.content_markdown}</pre>
    </div>
  );
}
