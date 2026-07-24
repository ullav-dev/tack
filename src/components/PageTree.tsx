"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { listPages, type Page } from "@/lib/tack-server-api";

interface Props {
  spaceId: string;
}

/** Sentinel key for the space's root pages (parent_id IS NULL) — mirrors
 * lagan's RepoTreePanel using `""` for a git tree's root directory. */
const ROOT_KEY = "";

/** Lazy-loaded hierarchical Page tree for one space — directly mirrors
 * `lagan/src/components/RepoTreePanel.tsx`'s pattern: children are fetched
 * on first expand (not all up front) and cached by parent id, with a
 * "generation" ref so a stale in-flight fetch from a space the user has
 * since navigated away from can't clobber the current tree's state.
 *
 * Unlike RepoTreePanel, there's no "expand ancestors of the currently open
 * item" effect here — a page's materialized `path` would let this be done,
 * but doing it well needs decoding that path against the tree's own
 * lazily-fetched node keys, which is deferred rather than adding real
 * complexity to a first pass; a directly-linked/bookmarked page just won't
 * show pre-expanded in the tree yet. */
export default function PageTree({ spaceId }: Props) {
  const { token } = useAuth();
  const params = useParams<{ pageId?: string }>();
  const selectedPageId = params.pageId;

  const [children, setChildren] = useState<Record<string, Page[]>>({});
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const generationRef = useRef(0);
  // Mirrors `children` synchronously so `load`'s cache check can't read a
  // render-stale snapshot within the same effect batch that just reset it.
  const childrenRef = useRef<Record<string, Page[]>>({});

  async function fetchChildren(parentId: string, generation: number) {
    if (!token) return;
    setLoading((prev) => new Set(prev).add(parentId));
    try {
      const pages = await listPages(token, spaceId, parentId || undefined);
      if (generation !== generationRef.current) return;
      childrenRef.current = { ...childrenRef.current, [parentId]: pages };
      setChildren(childrenRef.current);
    } catch (e) {
      if (generation === generationRef.current) setError((e as Error).message);
    } finally {
      if (generation === generationRef.current) {
        setLoading((prev) => {
          const next = new Set(prev);
          next.delete(parentId);
          return next;
        });
      }
    }
  }

  function load(parentId: string) {
    if (childrenRef.current[parentId] || loading.has(parentId)) return;
    fetchChildren(parentId, generationRef.current);
  }

  useEffect(() => {
    generationRef.current += 1;
    childrenRef.current = {};
    setChildren({});
    setExpanded(new Set());
    setLoading(new Set());
    setError(null);
    fetchChildren(ROOT_KEY, generationRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, spaceId]);

  function toggle(pageId: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(pageId)) {
        next.delete(pageId);
      } else {
        next.add(pageId);
        load(pageId);
      }
      return next;
    });
  }

  function renderLevel(parentId: string, depth: number) {
    const entries = children[parentId];
    if (!entries) {
      return loading.has(parentId) ? (
        <p className="text-xs text-slate-400" style={{ paddingLeft: `${depth * 14 + 24}px` }}>
          …
        </p>
      ) : null;
    }
    return (
      <div>
        {entries.map((page) => {
          const isSelected = selectedPageId === page.id;
          const hasChildren = page.child_count > 0;
          return (
            <div key={page.id}>
              <div
                className={`flex items-center gap-1 py-1 text-sm rounded ${
                  isSelected ? "bg-rose-50 text-rose-700 font-medium" : "text-slate-700"
                }`}
                style={{ paddingLeft: `${depth * 14 + 10}px` }}
              >
                {hasChildren ? (
                  <button
                    type="button"
                    onClick={() => toggle(page.id)}
                    className="shrink-0 w-4 text-xs text-slate-400 hover:text-slate-600"
                    aria-label={expanded.has(page.id) ? "Collapse" : "Expand"}
                  >
                    {expanded.has(page.id) ? "▾" : "▸"}
                  </button>
                ) : (
                  <span className="shrink-0 w-4" />
                )}
                <Link href={`/spaces/${spaceId}/pages/${page.id}`} className="truncate hover:underline">
                  {page.title}
                </Link>
              </div>
              {hasChildren && expanded.has(page.id) && renderLevel(page.id, depth + 1)}
            </div>
          );
        })}
      </div>
    );
  }

  if (error) return <p className="px-2 text-xs text-red-600">{error}</p>;
  return renderLevel(ROOT_KEY, 0);
}
