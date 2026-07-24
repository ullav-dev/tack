"use client";

import { useEffect, useRef, useState } from "react";
import { Link } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { useAuth } from "@/contexts/AuthContext";
import { listSpaces, search, type SearchHit, type Space } from "@/lib/tack-server-api";
import PageTree from "@/components/PageTree";
import NotesList from "@/components/NotesList";

const SEARCH_DEBOUNCE_MS = 300;

/** Left-hand workspace Navigator: a search box (wired to tack-server's
 * hybrid GET /search, ACL-filtered server-side) that replaces the browse
 * view while a query is active, and — when not searching — the browsable
 * structure: a Notes section (paginated, for the active team) and a Spaces
 * section, each space expandable into its own lazily-loaded Page tree
 * (see PageTree.tsx). */
export default function Navigator() {
  const { token } = useAuth();
  const t = useTranslations("navigator");

  const [spaces, setSpaces] = useState<Space[] | null>(null);
  const [spacesError, setSpacesError] = useState<string | null>(null);
  const [expandedSpaces, setExpandedSpaces] = useState<Set<string>>(new Set());

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
        if (!cancelled) setSpaces(s);
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

  function toggleSpace(spaceId: string) {
    setExpandedSpaces((prev) => {
      const next = new Set(prev);
      if (next.has(spaceId)) next.delete(spaceId);
      else next.add(spaceId);
      return next;
    });
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
        ) : (
          <>
            <div className="px-4 pt-3 pb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
              {t("notes")}
            </div>
            <NotesList />

            <div className="px-4 pt-4 pb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
              {t("spaces")}
            </div>
            <div className="pb-4">
              {spacesError && <p className="px-2 text-xs text-red-600">{spacesError}</p>}
              {!spaces && !spacesError && <p className="px-2 text-xs text-slate-400">{t("loading")}</p>}
              {spaces && spaces.length === 0 && <p className="px-2 text-xs text-slate-400">{t("noSpaces")}</p>}
              {spaces?.map((space) => (
                <div key={space.id}>
                  <button
                    type="button"
                    onClick={() => toggleSpace(space.id)}
                    className="flex w-full items-center gap-1 rounded px-2 py-1.5 text-left font-medium text-slate-700 hover:bg-slate-100"
                  >
                    <span className="shrink-0 w-4 text-xs text-slate-400">
                      {expandedSpaces.has(space.id) ? "▾" : "▸"}
                    </span>
                    <span className="truncate">{space.name}</span>
                  </button>
                  {expandedSpaces.has(space.id) && (
                    <div className="pl-2">
                      <PageTree spaceId={space.id} />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </nav>
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
