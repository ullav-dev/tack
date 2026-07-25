// Typed wrappers for tack-server. Requests go via the /api/* rewrite in the
// browser (see src/proxy.ts); same apiRequest<T> shape as auth-api.ts.

const BASE =
  typeof window === "undefined"
    ? (process.env.API_URL ?? "http://localhost:8087")
    : "/api";

async function apiRequest<T>(path: string, token: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...init?.headers,
    },
    ...init,
  });
  const contentType = res.headers.get("content-type") ?? "";
  if (res.status === 204 || !contentType.includes("application/json")) {
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return undefined as T;
  }
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
  return data as T;
}

// ── Spaces ────────────────────────────────────────────────────────────────────

export interface Space {
  id: string;
  organization_id: string;
  owning_service: string;
  team_id: string | null;
  name: string;
  created_at: string;
  updated_at: string;
}

export const listSpaces = (token: string): Promise<Space[]> => apiRequest("/spaces", token);

export const createSpace = (token: string, payload: { team_id: string; name: string }): Promise<Space> =>
  apiRequest("/spaces", token, { method: "POST", body: JSON.stringify(payload) });

// ── Pages ─────────────────────────────────────────────────────────────────────

export interface Page {
  id: string;
  organization_id: string;
  space_id: string;
  parent_id: string | null;
  path: string;
  title: string;
  is_template: boolean;
  content_markdown: string;
  created_by: string;
  created_at: string;
  updated_at: string;
  child_count: number;
}

export type PermissionLevel = "view" | "edit";

export const listPages = (token: string, spaceId: string, parentId?: string): Promise<Page[]> =>
  apiRequest(`/spaces/${spaceId}/pages${parentId ? `?parent_id=${parentId}` : ""}`, token);

export const getPage = (token: string, id: string): Promise<Page> => apiRequest(`/pages/${id}`, token);

export const createPage = (
  token: string,
  payload: { space_id: string; parent_id?: string; title: string; content_markdown?: string }
): Promise<Page> => apiRequest("/pages", token, { method: "POST", body: JSON.stringify(payload) });

export const updatePage = (
  token: string,
  id: string,
  payload: { title?: string; content_markdown?: string }
): Promise<Page> => apiRequest(`/pages/${id}`, token, { method: "PATCH", body: JSON.stringify(payload) });

export const getPagePermission = (token: string, id: string): Promise<{ level: PermissionLevel }> =>
  apiRequest(`/pages/${id}/permission`, token);

/** Soft-deletes a page. Does NOT cascade to child pages (a deliberate,
 * documented backend simplification) -- the frontend only allows this when
 * `child_count === 0`, so this never actually creates orphaned children in
 * practice; see PageEditor.tsx. */
export const deletePage = (token: string, id: string): Promise<void> =>
  apiRequest(`/pages/${id}`, token, { method: "DELETE" });

// ── Notes ─────────────────────────────────────────────────────────────────────

export type Visibility = "private" | "team" | "organization";

export interface Note {
  id: string;
  organization_id: string;
  team_id: string | null;
  parent_id: string | null;
  visibility: Visibility;
  /** Empty for replies -- only top-level notes collect a title. */
  title: string;
  body_markdown: string;
  created_by: string;
  created_at: string;
  updated_at: string;
  reply_count: number;
  /** For a reply, the parent note's latest saved version number at the
   * moment this reply was created -- `null` for top-level notes and for
   * replies made before this field existed. Used to show a reply only
   * while browsing that version (or the current state, if it's still the
   * latest one). */
  in_reply_to_version: number | null;
}

export interface NotesPage {
  notes: Note[];
  has_more: boolean;
}

export interface NoteRevision {
  id: string;
  note_id: string;
  version: number;
  body_markdown: string;
  edited_by: string;
  edited_at: string;
}

export const listNotes = (
  token: string,
  teamId: string,
  opts: { limit?: number; offset?: number } = {}
): Promise<NotesPage> => {
  const params = new URLSearchParams({ team_id: teamId });
  if (opts.limit !== undefined) params.set("limit", String(opts.limit));
  if (opts.offset !== undefined) params.set("offset", String(opts.offset));
  return apiRequest(`/notes?${params.toString()}`, token);
};

export const getNote = (token: string, id: string): Promise<Note> => apiRequest(`/notes/${id}`, token);

export const createNote = (
  token: string,
  payload: { team_id: string; visibility: Visibility; title: string; body_markdown: string }
): Promise<Note> => apiRequest("/notes", token, { method: "POST", body: JSON.stringify(payload) });

export const updateNote = (
  token: string,
  id: string,
  payload: { title?: string; body_markdown?: string; visibility?: Visibility }
): Promise<Note> => apiRequest(`/notes/${id}`, token, { method: "PATCH", body: JSON.stringify(payload) });

/** Soft-deletes a note or reply -- same endpoint, same creator-or-admin ACL
 * rule either way, since a reply is just a `notes` row with `parent_id`
 * set. */
export const deleteNote = (token: string, id: string): Promise<void> =>
  apiRequest(`/notes/${id}`, token, { method: "DELETE" });

export const listReplies = (token: string, id: string): Promise<Note[]> => apiRequest(`/notes/${id}/replies`, token);

export const createReply = (token: string, id: string, body_markdown: string): Promise<Note> =>
  apiRequest(`/notes/${id}/replies`, token, { method: "POST", body: JSON.stringify({ body_markdown }) });

export const listRevisions = (token: string, id: string): Promise<NoteRevision[]> =>
  apiRequest(`/notes/${id}/revisions`, token);

/** Snapshots the note's current body as a new named version — a deliberate
 * action (button click), not an automatic side effect of every save. */
export const createRevision = (token: string, id: string): Promise<NoteRevision> =>
  apiRequest(`/notes/${id}/revisions`, token, { method: "POST" });

/** Deletes one saved version. The server refuses to delete the last
 * remaining one. */
export const deleteRevision = (token: string, noteId: string, revisionId: string): Promise<void> =>
  apiRequest(`/notes/${noteId}/revisions/${revisionId}`, token, { method: "DELETE" });

// ── Search ────────────────────────────────────────────────────────────────────

export interface SearchHit {
  content_id: string;
  content_type: string;
  score: number;
  text: string;
}

export const search = (token: string, q: string): Promise<SearchHit[]> =>
  apiRequest(`/search?q=${encodeURIComponent(q)}`, token);
