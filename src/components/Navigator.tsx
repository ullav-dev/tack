"use client";

import { useEffect, useRef, useState } from "react";
import { Link } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { useAuth } from "@/contexts/AuthContext";
import { useTeam } from "@/contexts/TeamContext";
import { useNoteEvents } from "@/contexts/NoteEventsContext";
import { createSpace, listSpaces, renameSpace, search, type SearchHit, type Space } from "@/lib/tack-server-api";
import PageTree from "@/components/PageTree";
import NoteTree from "@/components/NoteTree";
import RefreshControl from "@/components/RefreshControl";
import { IconButton, editIcon, folderIcon, folderOpenIcon } from "@/components/Icon";

const SEARCH_DEBOUNCE_MS = 300;

/** The backend returns spaces `ORDER BY lower(name)`, but a freshly created
 * space was appended to the end of the array client-side, drifting out of
 * alphabetical order -- same fix, same rationale as NoteTree's
 * `sortFolders`. */
function sortSpaces(spaces: Space[]): Space[] {
  return [...spaces].sort((a, b) => a.name.localeCompare(b.name));
}

type NavigatorTab = "notes" | "spaces";
const TAB_STORAGE_KEY = "tack_navigator_tab";

function loadStoredTab(): NavigatorTab {
  if (typeof window === "undefined") return "notes";
  try {
    const stored = localStorage.getItem(TAB_STORAGE_KEY);
    return stored === "spaces" ? "spaces" : "notes";
  } catch {
    return "notes";
  }
}

/** Left-hand workspace Navigator: a search box (wired to tack-server's
 * hybrid GET /search, ACL-filtered server-side) that replaces the browse
 * view while a query is active, and — when not searching — Notes and
 * Spaces as two tabs (not one long stacked-and-scrolling panel, which
 * itself was one of the "structurally bad" complaints this redesign
 * responds to). The active tab is persisted to localStorage, same
 * lightweight convention as `tack_active_team_id`, so a refresh doesn't
 * reset which one you were on.
 *
 * The inactive tab's content is not mounted (a plain conditional, not a
 * CSS-hidden sibling) — this is deliberate, not just simpler: it's what
 * guarantees switching to Spaces can never trigger a Notes fetch (or vice
 * versa), which matters once NoteTree stops eagerly loading anything on
 * mount (see NoteTree.tsx's own doc comment). */
export default function Navigator() {
  const { token } = useAuth();
  const { activeTeam } = useTeam();
  const { triggerRefresh } = useNoteEvents();
  const t = useTranslations("navigator");

  const [activeTab, setActiveTabState] = useState<NavigatorTab>(loadStoredTab);

  const [spaces, setSpaces] = useState<Space[] | null>(null);
  const [spacesError, setSpacesError] = useState<string | null>(null);
  const [expandedSpaces, setExpandedSpaces] = useState<Set<string>>(new Set());
  const [creatingSpace, setCreatingSpace] = useState(false);
  const [newSpaceName, setNewSpaceName] = useState("");
  const [savingSpace, setSavingSpace] = useState(false);
  const [createSpaceError, setCreateSpaceError] = useState<string | null>(null);
  const [renamingSpaceId, setRenamingSpaceId] = useState<string | null>(null);
  const [renameSpaceDraft, setRenameSpaceDraft] = useState("");
  const [renamingSpace, setRenamingSpace] = useState(false);

  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchHit[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchGenerationRef = useRef(0);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    listSpaces(token)
      .then((s) => {
        if (!cancelled) setSpaces(sortSpaces(s));
      })
      .catch((e) => {
        if (!cancelled) setSpacesError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    const trimmed = query.trim();
    if (!trimmed || !token) {
      setSearchResults(null);
      setSearching(false);
      setSearchError(null);
      return;
    }

    searchGenerationRef.current += 1;
    const generation = searchGenerationRef.current;
    setSearching(true);
    debounceRef.current = setTimeout(() => {
      search(token, trimmed)
        .then((hits) => {
          if (generation !== searchGenerationRef.current) return;
          setSearchResults(hits);
          setSearchError(null);
        })
        .catch((e) => {
          if (generation === searchGenerationRef.current) setSearchError(e.message);
        })
        .finally(() => {
          if (generation === searchGenerationRef.current) setSearching(false);
        });
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, token]);

  function setActiveTab(tab: NavigatorTab) {
    setActiveTabState(tab);
    try {
      localStorage.setItem(TAB_STORAGE_KEY, tab);
    } catch {
      /* ignore */
    }
  }

  function toggleSpace(spaceId: string) {
    setExpandedSpaces((prev) => {
      const next = new Set(prev);
      if (next.has(spaceId)) next.delete(spaceId);
      else next.add(spaceId);
      return next;
    });
  }

  async function handleCreateSpace() {
    const name = newSpaceName.trim();
    if (!token || !activeTeam || !name || savingSpace) return;
    setSavingSpace(true);
    setCreateSpaceError(null);
    try {
      const space = await createSpace(token, { team_id: activeTeam.id, name });
      setSpaces((prev) => sortSpaces([...(prev ?? []), space]));
      setExpandedSpaces((prev) => new Set(prev).add(space.id));
      setCreatingSpace(false);
      setNewSpaceName("");
    } catch (e) {
      setCreateSpaceError((e as Error).message);
    } finally {
      setSavingSpace(false);
    }
  }

  function startRenameSpace(space: Space) {
    setRenamingSpaceId(space.id);
    setRenameSpaceDraft(space.name);
  }

  async function handleRenameSpace(space: Space) {
    const name = renameSpaceDraft.trim();
    if (renamingSpace) return;
    // Blurring with an empty (or unchanged) draft just closes the input --
    // same escape hatch as NoteTree's folder rename.
    if (!token || !name || name === space.name) {
      setRenamingSpaceId(null);
      return;
    }
    setRenamingSpace(true);
    setSpacesError(null);
    try {
      const updated = await renameSpace(token, space.id, name);
      setSpaces((prev) => (prev ? sortSpaces(prev.map((s) => (s.id === updated.id ? updated : s))) : prev));
      setRenamingSpaceId(null);
    } catch (e) {
      setSpacesError((e as Error).message);
    } finally {
      setRenamingSpace(false);
    }
  }

  return (
    <nav className="h-full flex flex-col text-sm border-r border-slate-200 bg-white">
      <div className="p-2 border-b border-slate-100 shrink-0">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("searchPlaceholder")}
          className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm focus:border-rose-400 focus:outline-none focus:ring-1 focus:ring-rose-400"
        />
      </div>

      {!query.trim() && (
        <nav className="flex border-b border-slate-200 shrink-0" aria-label={t("sections")}>
          <TabButton active={activeTab === "notes"} onClick={() => setActiveTab("notes")}>
            {t("notes")}
          </TabButton>
          <TabButton active={activeTab === "spaces"} onClick={() => setActiveTab("spaces")}>
            {t("spaces")}
          </TabButton>
        </nav>
      )}

      <div className="flex-1 overflow-y-auto min-h-0">
        {query.trim() ? (
          <div className="py-2">
            {searchError && <p className="px-3 py-1 text-xs text-red-600">{searchError}</p>}
            {searching && <p className="px-3 py-1 text-xs text-slate-400">{t("searching")}</p>}
            {!searching && searchResults && searchResults.length === 0 && (
              <p className="px-3 py-1 text-xs text-slate-400">{t("noResults")}</p>
            )}
            {searchResults?.map((hit) => (
              <SearchResultRow key={`${hit.content_type}:${hit.content_id}`} hit={hit} />
            ))}
          </div>
        ) : activeTab === "notes" ? (
          <div className="py-2">
            <div className="px-4 pb-1 flex items-center justify-end">
              <RefreshControl onRefresh={triggerRefresh} storageKey="tack_notes_refresh_interval" />
            </div>
            <NoteTree />
          </div>
        ) : (
          <div className="py-2">
            {spacesError && <p className="px-2 text-xs text-red-600">{spacesError}</p>}

            {/* Pinned at the top, ahead of the space list -- matches
                "+ New folder" in the Notes tab, so the one tree-level
                create action is in the same place in both tabs. */}
            {creatingSpace ? (
              <div className="px-2 py-1">
                <input
                  autoFocus
                  value={newSpaceName}
                  onChange={(e) => setNewSpaceName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleCreateSpace();
                    if (e.key === "Escape") {
                      setCreatingSpace(false);
                      setNewSpaceName("");
                    }
                  }}
                  onBlur={() => {
                    if (!newSpaceName.trim()) setCreatingSpace(false);
                  }}
                  disabled={savingSpace}
                  placeholder={t("newSpaceName")}
                  className="w-full text-sm rounded border border-slate-200 px-1.5 py-0.5 focus:border-rose-400 focus:outline-none"
                />
              </div>
            ) : activeTeam ? (
              <button
                type="button"
                onClick={() => setCreatingSpace(true)}
                className="w-full text-left px-2.5 py-1 text-xs font-medium text-rose-700 hover:underline"
              >
                + {t("newSpace")}
              </button>
            ) : (
              <p className="px-2 py-1 text-xs text-slate-400">{t("selectTeamFirst")}</p>
            )}
            {createSpaceError && <p className="px-2 py-1 text-xs text-red-600">{createSpaceError}</p>}

            {!spaces && !spacesError && <p className="px-2 text-xs text-slate-400">{t("loading")}</p>}
            {spaces && spaces.length === 0 && <p className="px-2 text-xs text-slate-400">{t("noSpaces")}</p>}
            {spaces?.map((space) =>
              renamingSpaceId === space.id ? (
                <div key={space.id} className="px-2 py-1">
                  <input
                    autoFocus
                    value={renameSpaceDraft}
                    onChange={(e) => setRenameSpaceDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleRenameSpace(space);
                      if (e.key === "Escape") setRenamingSpaceId(null);
                    }}
                    onBlur={() => handleRenameSpace(space)}
                    disabled={renamingSpace}
                    className="w-full text-sm rounded border border-slate-200 px-1.5 py-0.5 focus:border-rose-400 focus:outline-none"
                  />
                </div>
              ) : (
                <div key={space.id}>
                  <div className="group flex items-center gap-1 rounded px-2 py-1.5 text-sm text-slate-700 hover:bg-slate-100">
                    <button
                      type="button"
                      onClick={() => toggleSpace(space.id)}
                      className="flex flex-1 min-w-0 items-center gap-1.5 text-left font-medium"
                    >
                      <span className="shrink-0 w-3 text-xs text-slate-400">
                        {expandedSpaces.has(space.id) ? "▾" : "▸"}
                      </span>
                      <span className="shrink-0 text-slate-400">
                        {expandedSpaces.has(space.id) ? folderOpenIcon : folderIcon}
                      </span>
                      <span className="truncate">{space.name}</span>
                    </button>
                    <IconButton title={t("renameSpace")} onClick={() => startRenameSpace(space)}>
                      <span className="opacity-0 group-hover:opacity-100">{editIcon}</span>
                    </IconButton>
                  </div>
                  {expandedSpaces.has(space.id) && (
                    <div className="ml-4 border-l-2 border-slate-200 pl-2">
                      <PageTree spaceId={space.id} />
                    </div>
                  )}
                </div>
              )
            )}
          </div>
        )}
      </div>
    </nav>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`flex-1 px-3 py-2 text-xs font-semibold uppercase tracking-wide border-b-2 -mb-px transition-colors ${
        active ? "border-rose-700 text-rose-700" : "border-transparent text-slate-400 hover:text-slate-600"
      }`}
    >
      {children}
    </button>
  );
}

function SearchResultRow({ hit }: { hit: SearchHit }) {
  const t = useTranslations("navigator");
  // Only Notes are indexed today (Page content indexing is a documented,
  // pending backend gap — see tack-server's CLAUDE.md) -- and a Page hit
  // wouldn't have enough information here to build its
  // /spaces/:spaceId/pages/:pageId URL anyway, since search doesn't return
  // a page's space id. Render other content types as non-navigable rather
  // than link to something broken.
  const href = hit.content_type === "note" ? `/notes/${hit.content_id}` : null;

  const body = (
    <>
      <p className="truncate text-sm text-slate-700">{hit.text}</p>
      {!href && <p className="text-xs text-slate-400">{t("notIndexedYet")}</p>}
    </>
  );

  if (!href) {
    return <div className="px-3 py-1.5 opacity-60">{body}</div>;
  }
  return (
    <Link href={href} className="block rounded px-3 py-1.5 hover:bg-slate-100">
      {body}
    </Link>
  );
}
