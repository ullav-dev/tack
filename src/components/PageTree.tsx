"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { usePageEvents } from "@/contexts/PageEventsContext";
import { createPage, listPages, updatePage, type Page } from "@/lib/tack-server-api";
import { IconButton, editIcon, pageIcon, plusIcon } from "@/components/Icon";

interface Props {
  spaceId: string;
}

/** Sentinel key for the space's root pages (parent_id IS NULL) — mirrors
 * lagan's RepoTreePanel using `""` for a git tree's root directory. */
const ROOT_KEY = "";

/** The backend returns a level's pages `ORDER BY lower(title)`, but a
 * freshly created page was appended to the end of its parent's array
 * client-side, and a title edit didn't re-sort in place -- same fix, same
 * rationale as NoteTree's `sortFolders`/Navigator's `sortSpaces`. */
function sortPages(pages: Page[]): Page[] {
  return [...pages].sort((a, b) => a.title.localeCompare(b.title));
}

/** Lazy-loaded hierarchical Page tree for one space — directly mirrors
 * `lagan/src/components/RepoTreePanel.tsx`'s pattern: children are fetched
 * on first expand (not all up front) and cached by parent id, with a
 * "generation" ref so a stale in-flight fetch from a space the user has
 * since navigated away from can't clobber the current tree's state.
 *
 * Each level's children are indented via a wrapper (a left border + inset,
 * the same "thread" treatment NoteTree.tsx uses for a folder's notes) --
 * not depth-scaled inline padding on the row itself, which reads as
 * ambiguous once you're more than one level deep. A page always shows its
 * own document icon (`pageIcon`) next to its toggle, even when it has
 * children -- a page is real content in its own right, unlike a Space or a
 * Notes folder, which are pure containers and get a folder icon instead.
 *
 * Unlike RepoTreePanel, there's no "expand ancestors of the currently open
 * item" effect here — a page's materialized `path` would let this be done,
 * but doing it well needs decoding that path against the tree's own
 * lazily-fetched node keys, which is deferred rather than adding real
 * complexity to a first pass; a directly-linked/bookmarked page just won't
 * show pre-expanded in the tree yet. */
export default function PageTree({ spaceId }: Props) {
  const { token } = useAuth();
  const router = useRouter();
  const { subscribe, subscribeDeleted } = usePageEvents();
  const t = useTranslations("navigator");
  const params = useParams<{ pageId?: string }>();
  const selectedPageId = params.pageId;

  const [children, setChildren] = useState<Record<string, Page[]>>({});
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  /** Which parent (by id, `ROOT_KEY` for the space root) is currently
   * showing the inline "new page" title input, if any. */
  const [creatingUnder, setCreatingUnder] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const [creating, setCreating] = useState(false);

  /** Which page is currently showing the inline rename input, if any --
   * mirrors NoteTree's folder rename. Renaming here is the tree-level
   * equivalent of editing the title inline in PageEditor (same
   * `PATCH /pages/:id`) -- added because that in-editor rename had no
   * visible affordance signaling it was even possible.
   *
   * Known gap: PageEditor only ever *publishes* metadata changes via
   * `usePageEvents` (`notifyPageUpdated`), it doesn't subscribe -- so
   * renaming a page here while that same page's editor is open elsewhere
   * won't update the open editor's title until it's reloaded. Pre-existing
   * asymmetry in this pub/sub (NoteThread/NotesList have the same one-way
   * shape), not introduced by this change, but this is the first path that
   * can actually trigger it (there was previously no other way to rename a
   * page than through the editor itself). */
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [renaming, setRenaming] = useState(false);

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

  // PageEditor (a sibling in the right-hand pane) broadcasts metadata
  // changes -- like a title edit -- through this shared pub/sub, since
  // there's no other way for this tree's own cached page list to learn
  // about them (see PageEventsContext.tsx).
  useEffect(() => {
    return subscribe((pageId, patch) => {
      childrenRef.current = Object.fromEntries(
        Object.entries(childrenRef.current).map(([parentId, pages]) => [
          parentId,
          // A title patch can change sort order, not just the displayed
          // text -- re-sort the level it's in, not just update it in place.
          sortPages(pages.map((p) => (p.id === pageId ? { ...p, ...patch } : p))),
        ])
      );
      setChildren(childrenRef.current);
    });
  }, [subscribe]);

  // PageEditor also broadcasts when the page itself was deleted (only ever
  // a leaf -- delete is blocked client-side while child_count > 0 -- so
  // there's no orphaned-subtree cleanup to do here beyond dropping its own
  // now-stale cached children entry, if it had one).
  useEffect(() => {
    return subscribeDeleted((pageId) => {
      childrenRef.current = Object.fromEntries(
        Object.entries(childrenRef.current)
          .filter(([parentId]) => parentId !== pageId)
          .map(([parentId, pages]) => [parentId, pages.filter((p) => p.id !== pageId)])
      );
      setChildren(childrenRef.current);
    });
  }, [subscribeDeleted]);

  async function handleCreate(parentId: string) {
    const title = newTitle.trim();
    if (!token || !title || creating) return;
    setCreating(true);
    try {
      const page = await createPage(token, {
        space_id: spaceId,
        parent_id: parentId || undefined,
        title,
      });
      const existing = childrenRef.current[parentId] ?? [];
      childrenRef.current = { ...childrenRef.current, [parentId]: sortPages([...existing, page]) };
      setChildren(childrenRef.current);
      if (parentId) setExpanded((prev) => new Set(prev).add(parentId));
      setCreatingUnder(null);
      setNewTitle("");
      router.push(`/spaces/${spaceId}/pages/${page.id}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCreating(false);
    }
  }

  function startRename(page: Page) {
    setRenamingId(page.id);
    setRenameDraft(page.title);
  }

  async function handleRename(page: Page) {
    const title = renameDraft.trim();
    if (renaming) return;
    // Blurring with an empty (or unchanged) draft just closes the input.
    if (!token || !title || title === page.title) {
      setRenamingId(null);
      return;
    }
    setRenaming(true);
    setError(null);
    try {
      const updated = await updatePage(token, page.id, { title });
      childrenRef.current = Object.fromEntries(
        Object.entries(childrenRef.current).map(([parentId, pages]) => [
          parentId,
          sortPages(pages.map((p) => (p.id === updated.id ? updated : p))),
        ])
      );
      setChildren(childrenRef.current);
      setRenamingId(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRenaming(false);
    }
  }

  function renderCreateRow(parentId: string) {
    if (creatingUnder !== parentId) return null;
    return (
      <div className="flex items-center gap-1 px-2 py-1">
        <input
          autoFocus
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleCreate(parentId);
            if (e.key === "Escape") {
              setCreatingUnder(null);
              setNewTitle("");
            }
          }}
          onBlur={() => {
            if (!newTitle.trim()) setCreatingUnder(null);
          }}
          disabled={creating}
          placeholder={t("newPageTitle")}
          className="flex-1 min-w-0 text-sm rounded border border-slate-200 px-1.5 py-0.5 focus:border-rose-400 focus:outline-none"
        />
      </div>
    );
  }

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

  function renderLevel(parentId: string) {
    const entries = children[parentId];
    if (!entries) {
      return loading.has(parentId) ? <p className="px-2 py-1 text-xs text-slate-400">…</p> : null;
    }
    return (
      <div>
        {entries.map((page) => {
          const isSelected = selectedPageId === page.id;
          const isExpanded = expanded.has(page.id);
          // A page just given its first child (via the "+" affordance
          // below) has a stale `child_count` of 0 from when its parent
          // list was fetched -- `isExpanded` (not `child_count`) is what
          // actually gates rendering its children, so that stays correct.
          const showToggle = page.child_count > 0 || isExpanded;
          if (renamingId === page.id) {
            return (
              <div key={page.id} className="px-2 py-1">
                <input
                  autoFocus
                  value={renameDraft}
                  onChange={(e) => setRenameDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleRename(page);
                    if (e.key === "Escape") setRenamingId(null);
                  }}
                  onBlur={() => handleRename(page)}
                  disabled={renaming}
                  className="w-full text-sm rounded border border-slate-200 px-1.5 py-0.5 focus:border-rose-400 focus:outline-none"
                />
              </div>
            );
          }
          return (
            <div key={page.id}>
              <div
                className={`group flex items-center gap-1.5 rounded px-2 py-1 text-sm ${
                  isSelected ? "bg-rose-50 text-rose-700 font-medium" : "text-slate-700 hover:bg-slate-100"
                }`}
              >
                {showToggle ? (
                  <button
                    type="button"
                    onClick={() => toggle(page.id)}
                    className="shrink-0 w-3 text-xs text-slate-400 hover:text-slate-600"
                    aria-label={isExpanded ? "Collapse" : "Expand"}
                  >
                    {isExpanded ? "▾" : "▸"}
                  </button>
                ) : (
                  <span className="shrink-0 w-3" />
                )}
                <span className={`shrink-0 ${isSelected ? "text-rose-400" : "text-slate-300"}`}>{pageIcon}</span>
                <Link href={`/spaces/${spaceId}/pages/${page.id}`} className="truncate flex-1 min-w-0">
                  {page.title}
                </Link>
                <IconButton title={t("renamePage")} onClick={() => startRename(page)}>
                  <span className="opacity-0 group-hover:opacity-100">{editIcon}</span>
                </IconButton>
                <IconButton
                  title={t("newPage")}
                  onClick={() => {
                    setExpanded((prev) => new Set(prev).add(page.id));
                    load(page.id);
                    setCreatingUnder(page.id);
                  }}
                >
                  <span className="opacity-0 group-hover:opacity-100">{plusIcon}</span>
                </IconButton>
              </div>
              {isExpanded && (
                <div className="ml-4 border-l-2 border-slate-200 pl-2">
                  {renderLevel(page.id)}
                  {renderCreateRow(page.id)}
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  if (error) return <p className="px-2 text-xs text-red-600">{error}</p>;
  return (
    <div>
      {renderLevel(ROOT_KEY)}
      {renderCreateRow(ROOT_KEY)}
      <button
        type="button"
        onClick={() => setCreatingUnder(ROOT_KEY)}
        className="w-full text-left px-2.5 py-1 text-xs font-medium text-rose-700 hover:underline"
      >
        + {t("newPage")}
      </button>
    </div>
  );
}
