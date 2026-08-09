"use client";

import { useEffect, useRef, useState } from "react";
import { Link } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { useAuth } from "@/contexts/AuthContext";
import { useTeam } from "@/contexts/TeamContext";
import { useNoteEvents } from "@/contexts/NoteEventsContext";
import {
  createSpace,
  listNoteFolders,
  listSpaces,
  renameSpace,
  search,
  type NoteFolder,
  type SearchHit,
  type SearchResults,
  type Space,
} from "@/lib/tack-server-api";
import PageTree from "@/components/PageTree";
import NoteTree from "@/components/NoteTree";
import RefreshControl from "@/components/RefreshControl";
import Pager from "@/components/Pager";
import { IconButton, editIcon, folderIcon, folderOpenIcon, noteIcon, pageIcon } from "@/components/Icon";

const SEARCH_DEBOUNCE_MS = 300;
const SPACES_PAGE_SIZE = 25;
const SEARCH_PAGE_SIZE = 10;

/** Splits an OpenSearch highlight fragment on its own `<em>`/`</em>`
 * markers and renders each piece as plain text (never as raw HTML) --
 * these tags are OpenSearch's own fixed default highlight delimiters
 * (never configured otherwise, never sourced from note/page content
 * itself), but the *text between* them is real user-authored content, so
 * this parses just those two literal tags rather than trusting the whole
 * fragment as HTML via `dangerouslySetInnerHTML`. */
function renderHighlight(fragment: string): React.ReactNode {
  const nodes: React.ReactNode[] = [];
  const re = /<em>(.*?)<\/em>/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;
  while ((match = re.exec(fragment))) {
    if (match.index > lastIndex) nodes.push(fragment.slice(lastIndex, match.index));
    nodes.push(
      <mark key={key++} className="bg-amber-100 text-amber-900 rounded-sm px-0.5">
        {match[1]}
      </mark>
    );
    lastIndex = re.lastIndex;
  }
  if (lastIndex < fragment.length) nodes.push(fragment.slice(lastIndex));
  return nodes;
}

/** The backend returns one page of spaces `ORDER BY lower(name)`, but that
 * only covers the fetched page -- a freshly created or renamed space needs
 * the same client-side re-sort (it can land wherever on the currently shown
 * page), same rationale as NoteTree's `sortFolders`. */
function sortSpaces(spaces: Space[]): Space[] {
  return [...spaces].sort((a, b) => a.name.localeCompare(b.name));
}

function totalPages(total: number): number {
  return Math.max(1, Math.ceil(total / SPACES_PAGE_SIZE));
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
  const [spacesTotal, setSpacesTotal] = useState(0);
  const [spacesPage, setSpacesPage] = useState(1);
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
  const [searchResults, setSearchResults] = useState<SearchResults | null>(null);
  const [notesPage, setNotesPage] = useState(1);
  const [pagesPage, setPagesPage] = useState(1);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  // "View in folder" from a note search result: clears the search, switches
  // to the Notes tab, and asks NoteTree to expand+navigate to the note's
  // real folder. Lives here (not in NoteTree) since it has to survive
  // NoteTree not even being mounted yet at the moment the result is
  // clicked (the Spaces tab could be active). NoteTree clears it via
  // `onRevealed` once handled.
  const [revealRequest, setRevealRequest] = useState<{ noteId: string; folderId: string | null } | null>(null);

  // Cheap metadata (names only, not note content), fetched once per team so
  // a note hit's folder badge can show a real name instead of a raw id.
  // Only ever covers the *active* team's folders -- a hit belonging to a
  // different team (search itself isn't team-scoped) just shows without a
  // folder badge rather than a wrong or unresolved one.
  const [searchFolders, setSearchFolders] = useState<NoteFolder[]>([]);
  useEffect(() => {
    if (!token || !activeTeam) {
      setSearchFolders([]);
      return;
    }
    listNoteFolders(token, activeTeam.id, { limit: 100 })
      .then((result) => setSearchFolders(result.folders))
      .catch(() => {
        /* Non-fatal: folder badges just won't resolve a name. */
      });
  }, [token, activeTeam]);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchGenerationRef = useRef(0);

  async function fetchSpaces(page: number) {
    if (!token) return;
    try {
      const result = await listSpaces(token, { limit: SPACES_PAGE_SIZE, offset: (page - 1) * SPACES_PAGE_SIZE });
      setSpaces(sortSpaces(result.spaces));
      setSpacesTotal(result.total);
      setSpacesPage(page);
      setSpacesError(null);
    } catch (e) {
      setSpacesError((e as Error).message);
    }
  }

  useEffect(() => {
    if (!token) return;
    fetchSpaces(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function runSearch(q: string, atNotesPage: number, atPagesPage: number, generation: number) {
    if (!token) return;
    try {
      const results = await search(token, q, {
        notesLimit: SEARCH_PAGE_SIZE,
        notesOffset: (atNotesPage - 1) * SEARCH_PAGE_SIZE,
        pagesLimit: SEARCH_PAGE_SIZE,
        pagesOffset: (atPagesPage - 1) * SEARCH_PAGE_SIZE,
      });
      if (generation !== searchGenerationRef.current) return;
      setSearchResults(results);
      setSearchError(null);
    } catch (e) {
      if (generation === searchGenerationRef.current) setSearchError((e as Error).message);
    } finally {
      if (generation === searchGenerationRef.current) setSearching(false);
    }
  }

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
    // A new query always starts both sections back at page 1 -- carrying
    // over whatever page a previous, unrelated query happened to be on
    // wouldn't mean anything for this one.
    setNotesPage(1);
    setPagesPage(1);
    debounceRef.current = setTimeout(() => {
      runSearch(trimmed, 1, 1, generation);
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, token]);

  function handleNotesPageChange(page: number) {
    setNotesPage(page);
    searchGenerationRef.current += 1;
    runSearch(query.trim(), page, pagesPage, searchGenerationRef.current);
  }

  function handlePagesPageChange(page: number) {
    setPagesPage(page);
    searchGenerationRef.current += 1;
    runSearch(query.trim(), notesPage, page, searchGenerationRef.current);
  }

  function handleViewInFolder(hit: SearchHit) {
    setQuery("");
    setActiveTab("notes");
    setRevealRequest({ noteId: hit.content_id, folderId: hit.folder_id });
  }

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
      // A new space can land on any page alphabetically -- jump to page 1
      // and refetch rather than guessing whether it belongs on the page
      // currently shown.
      await fetchSpaces(1);
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
      await renameSpace(token, space.id, name);
      // Same reasoning as create: a rename can move a space to a different
      // page -- refetch the current page rather than patching in place.
      await fetchSpaces(spacesPage);
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
            {!searching && searchResults && searchResults.notes.total === 0 && searchResults.pages.total === 0 && (
              <p className="px-3 py-1 text-xs text-slate-400">{t("noResults")}</p>
            )}
            {searchResults && (searchResults.notes.total > 0 || searchResults.pages.total > 0) && (
              <>
                <div className="px-3 pt-1 pb-1 flex items-baseline gap-1.5">
                  <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">{t("notes")}</span>
                  <span className="text-xs text-slate-400">({searchResults.notes.total})</span>
                </div>
                {searchResults.notes.hits.length === 0 && (
                  <p className="px-3 py-1 text-xs text-slate-400">{t("noResults")}</p>
                )}
                {searchResults.notes.hits.map((hit) => (
                  <SearchResultRow key={hit.content_id} hit={hit} folders={searchFolders} onViewInFolder={handleViewInFolder} />
                ))}
                <Pager
                  page={notesPage}
                  totalPages={Math.ceil(searchResults.notes.total / SEARCH_PAGE_SIZE)}
                  onChange={handleNotesPageChange}
                  disabled={searching}
                />

                <div className="px-3 pt-3 pb-1 flex items-baseline gap-1.5">
                  <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                    {t("searchPagesSection")}
                  </span>
                  <span className="text-xs text-slate-400">({searchResults.pages.total})</span>
                </div>
                {searchResults.pages.hits.length === 0 && (
                  <p className="px-3 py-1 text-xs text-slate-400">{t("noResults")}</p>
                )}
                {searchResults.pages.hits.map((hit) => (
                  <SearchResultRow key={hit.content_id} hit={hit} folders={searchFolders} />
                ))}
                <Pager
                  page={pagesPage}
                  totalPages={Math.ceil(searchResults.pages.total / SEARCH_PAGE_SIZE)}
                  onChange={handlePagesPageChange}
                  disabled={searching}
                />
              </>
            )}
          </div>
        ) : activeTab === "notes" ? (
          <div className="py-2">
            <div className="px-4 pb-1 flex items-center justify-end">
              <RefreshControl onRefresh={triggerRefresh} storageKey="tack_notes_refresh_interval" />
            </div>
            <NoteTree revealRequest={revealRequest} onRevealed={() => setRevealRequest(null)} />
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
            <Pager page={spacesPage} totalPages={totalPages(spacesTotal)} onChange={fetchSpaces} />
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

function SearchResultRow({
  hit,
  folders,
  onViewInFolder,
}: {
  hit: SearchHit;
  folders: NoteFolder[];
  /** Only meaningful for a top-level note hit -- a reply has no folder of
   * its own (`folder_id` is only ever set on a top-level note, see
   * tack-server's index_note), and a page hit is revealed via its own
   * space/PageTree, not this. Omitted entirely for page rows below. */
  onViewInFolder?: (hit: SearchHit) => void;
}) {
  const t = useTranslations("navigator");
  const isReply = hit.content_type === "note" && hit.parent_id !== null;
  // A reply hit links to its parent thread (it has no useful standalone
  // view of its own); a page hit needs its space_id to build a real link
  // at all -- both are now returned by the backend (they weren't before).
  const href =
    hit.content_type === "note"
      ? `/notes/${hit.parent_id ?? hit.content_id}`
      : hit.space_id
        ? `/spaces/${hit.space_id}/pages/${hit.content_id}`
        : null;
  const folderName = hit.folder_id ? folders.find((f) => f.id === hit.folder_id)?.name : undefined;
  const snippet = hit.highlight[0] ?? hit.text;
  const canViewInFolder = onViewInFolder && hit.content_type === "note" && !isReply;

  const body = (
    <>
      <div className="flex items-center gap-1.5">
        <span className="shrink-0 text-slate-300">{hit.content_type === "note" ? noteIcon : pageIcon}</span>
        <span className="truncate text-sm font-medium text-slate-800">
          {isReply ? t("inAReply") : hit.title || t("untitledNote")}
        </span>
        {folderName && (
          <span className="shrink-0 text-xs px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500">{folderName}</span>
        )}
        {canViewInFolder && (
          <IconButton
            title={t("viewInFolder")}
            onClick={(e) => {
              // Stop the click from bubbling to the wrapping <Link> below,
              // which would otherwise also navigate/follow its own href.
              e.preventDefault();
              e.stopPropagation();
              onViewInFolder(hit);
            }}
          >
            {folderIcon}
          </IconButton>
        )}
      </div>
      <p className="truncate text-xs text-slate-500 pl-5.5">{renderHighlight(snippet)}</p>
      {!href && <p className="text-xs text-slate-400 pl-5.5">{t("notIndexedYet")}</p>}
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
