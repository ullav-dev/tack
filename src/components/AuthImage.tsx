"use client";

import { useEffect, useState } from "react";

interface Props {
  src: string;
  alt: string;
  token: string;
}

/** Authenticated-fetch-to-blob-URL image renderer for DAM-hosted images
 * embedded in markdown — the same pattern already used in
 * `togra/src/components/ideas/StickyCard.tsx`, since a plain `<img src>`
 * can't carry an Authorization header. Tack doesn't have its own DAM proxy
 * wired up yet (see F5 in the frontend implementation plan), but Notes can
 * already contain markdown image links pointing at DAM asset URLs created
 * elsewhere, so this is worth having ahead of that. */
export default function AuthImage({ src, alt, token }: Props) {
  const [blobSrc, setBlobSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;
    fetch(src, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => {
        if (!r.ok) throw new Error();
        return r.blob();
      })
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setBlobSrc(objectUrl);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [src, token]);

  if (failed) return <span className="text-xs text-red-400 italic">Image unavailable</span>;
  if (!blobSrc) return <span className="text-xs text-slate-400 animate-pulse">Loading image…</span>;
  return <img src={blobSrc} alt={alt} className="max-w-full rounded-lg border border-slate-200 my-1" />;
}
