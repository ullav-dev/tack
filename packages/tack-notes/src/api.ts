// API client for tack-server with a configurable base URL + token, mirroring
// @ullav-dev/dam-picker's createDamClient(base, token) shape -- the host
// app supplies its own proxy prefix (e.g. "/api/tack") or points straight
// at tack-server, and its own token source (however that app keeps its
// session). Types mirror tack/src/lib/tack-server-api.ts's Notes slice
// exactly, plus the note_reads/system_principals additions from Phase 0 of
// the AWE-apps Notes migration.

export type Visibility = "private" | "team" | "organization";

export interface Note {
  id: string;
  organization_id: string;
  team_id: string | null;
  parent_id: string | null;
  folder_id: string | null;
  visibility: Visibility;
  title: string;
  body_markdown: string;
  created_by: string;
  created_at: string;
  updated_at: string;
  reply_count: number;
  in_reply_to_version: number | null;
}

export interface NotesPage {
  notes: Note[];
  has_more: boolean;
  total: number;
}

export interface NoteRevision {
  id: string;
  note_id: string;
  version: number;
  body_markdown: string;
  edited_by: string;
  edited_at: string;
}

export interface NoteFolder {
  id: string;
  organization_id: string;
  team_id: string;
  name: string;
  /** All three set together (an entity-scoped folder, e.g. one cunav
   * ticket's own sub-folders) or all three null (a team-wide folder). See
   * tack-server's `012_entity_scoped_note_folders.sql`. */
  owning_service: string | null;
  entity_type: string | null;
  entity_id: string | null;
  created_at: string;
  updated_at: string;
  note_count: number;
}

export interface NoteFoldersPage {
  folders: NoteFolder[];
  total: number;
}

export interface NoteRead {
  note_id: string;
  read_at: string;
}

export interface NoteUnreadStatus {
  note_id: string;
  unread: boolean;
  last_activity_at: string;
}

export interface SystemPrincipal {
  id: string;
  organization_id: string;
  label: string;
  created_at: string;
}

export interface SystemPrincipalsPage {
  principals: SystemPrincipal[];
  total: number;
}

export interface AttachRequest {
  owning_service: string;
  entity_type: string;
  entity_id: string;
}

export interface TackNotesApi {
  listNotes(
    teamId: string,
    opts?: {
      limit?: number;
      offset?: number;
      folderId?: string;
      unfiled?: boolean;
      /** Opaque host-defined filter key, layered on top of folderId/unfiled
       * (e.g. cartlann's "shared-by-me"/"shared-by-others" virtual smart-
       * folders, which have no tack-native concept at all). The real
       * `createTackNotesApi` implementation below ignores this entirely --
       * tack-server has no such filter -- so it only has an effect behind a
       * host's own hybrid adapter (see `tack-notes-adapter.ts` in
       * ullav-collection-browser for the reference implementation). */
      filterKey?: string;
    }
  ): Promise<NotesPage>;
  getNote(id: string): Promise<Note>;
  createNote(payload: {
    team_id: string;
    visibility: Visibility;
    title: string;
    body_markdown: string;
    folder_id?: string;
    attach?: AttachRequest;
    /** Opaque host-defined extra fields merged into the request by a
     * host's own hybrid adapter (e.g. cartlann's `description` and
     * `object_ids`, neither of which tack-server's own schema has). The
     * real `createTackNotesApi` implementation strips this before sending
     * -- tack-server's own `POST /notes` contract is untouched by this. */
    extra?: Record<string, unknown>;
  }): Promise<Note>;
  /** Top-level notes attached to an external entity (e.g. a cunav ticket, a
   * togra workflow), oldest-first -- see tack-server's `GET /notes/by-entity`.
   * Not paginated: entity-attached note counts are small in practice (a
   * thread per ticket, not a team-wide list), unlike `listNotes`. */
  listNotesByAttachment(owningService: string, entityType: string, entityId: string): Promise<Note[]>;
  updateNote(
    id: string,
    payload: {
      title?: string;
      body_markdown?: string;
      visibility?: Visibility;
      folder_id?: string | null;
      /** See `createNote`'s own `extra` doc comment -- same passthrough,
       * same real-impl strip-before-send behavior. */
      extra?: Record<string, unknown>;
    }
  ): Promise<Note>;
  deleteNote(id: string): Promise<void>;
  listReplies(id: string): Promise<Note[]>;
  createReply(id: string, bodyMarkdown: string): Promise<Note>;
  listNoteFolders(teamId?: string, opts?: { limit?: number; offset?: number }): Promise<NoteFoldersPage>;
  createNoteFolder(payload: { team_id: string; name: string; attach?: AttachRequest }): Promise<NoteFolder>;
  renameNoteFolder(id: string, name: string): Promise<NoteFolder>;
  deleteNoteFolder(id: string): Promise<void>;
  /** One entity's own folders (e.g. a cunav ticket's sub-folders) -- see
   * tack-server's `GET /note-folders/by-entity`. Not paginated, same
   * reasoning as `listNotesByAttachment`. */
  listNoteFoldersByAttachment(owningService: string, entityType: string, entityId: string): Promise<NoteFolder[]>;
  listRevisions(id: string): Promise<NoteRevision[]>;
  createRevision(id: string): Promise<NoteRevision>;
  deleteRevision(noteId: string, revisionId: string): Promise<void>;
  markNoteRead(id: string): Promise<NoteRead>;
  listUnread(noteIds: string[]): Promise<NoteUnreadStatus[]>;
  listSystemPrincipals(organizationId: string, opts?: { limit?: number; offset?: number }): Promise<SystemPrincipalsPage>;
}

async function request<T>(base: string, token: string, path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${base}${path}`, {
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

/** Binds a `TackNotesApi` to a base URL (e.g. a host app's own `/api/tack`
 * proxy prefix, or tack-server directly) and a token, so callers throughout
 * this package never juggle either explicitly -- same shape as
 * `@ullav-dev/dam-picker`'s `createDamClient(base, token)`. */
export function createTackNotesApi(base: string, token: string): TackNotesApi {
  const req = <T>(path: string, init?: RequestInit) => request<T>(base, token, path, init);

  return {
    listNotes(teamId, opts = {}) {
      const params = new URLSearchParams({ team_id: teamId });
      if (opts.limit !== undefined) params.set("limit", String(opts.limit));
      if (opts.offset !== undefined) params.set("offset", String(opts.offset));
      if (opts.folderId) params.set("folder_id", opts.folderId);
      else if (opts.unfiled) params.set("unfiled", "true");
      // opts.filterKey is a host-adapter-only concern -- tack-server has no
      // such filter, so it's deliberately never added to the query string.
      return req(`/notes?${params.toString()}`);
    },
    getNote: (id) => req(`/notes/${id}`),
    createNote: ({ extra: _extra, ...payload }) => req("/notes", { method: "POST", body: JSON.stringify(payload) }),
    listNotesByAttachment(owningService, entityType, entityId) {
      const params = new URLSearchParams({ owning_service: owningService, entity_type: entityType, entity_id: entityId });
      return req(`/notes/by-entity?${params.toString()}`);
    },
    updateNote: (id, { extra: _extra, ...payload }) => req(`/notes/${id}`, { method: "PATCH", body: JSON.stringify(payload) }),
    deleteNote: (id) => req(`/notes/${id}`, { method: "DELETE" }),
    listReplies: (id) => req(`/notes/${id}/replies`),
    createReply: (id, bodyMarkdown) => req(`/notes/${id}/replies`, { method: "POST", body: JSON.stringify({ body_markdown: bodyMarkdown }) }),
    listNoteFolders(teamId, opts = {}) {
      const params = new URLSearchParams();
      if (teamId) params.set("team_id", teamId);
      if (opts.limit !== undefined) params.set("limit", String(opts.limit));
      if (opts.offset !== undefined) params.set("offset", String(opts.offset));
      const qs = params.toString();
      return req(`/note-folders${qs ? `?${qs}` : ""}`);
    },
    createNoteFolder: (payload) => req("/note-folders", { method: "POST", body: JSON.stringify(payload) }),
    renameNoteFolder: (id, name) => req(`/note-folders/${id}`, { method: "PATCH", body: JSON.stringify({ name }) }),
    deleteNoteFolder: (id) => req(`/note-folders/${id}`, { method: "DELETE" }),
    listNoteFoldersByAttachment(owningService, entityType, entityId) {
      const params = new URLSearchParams({ owning_service: owningService, entity_type: entityType, entity_id: entityId });
      return req(`/note-folders/by-entity?${params.toString()}`);
    },
    listRevisions: (id) => req(`/notes/${id}/revisions`),
    createRevision: (id) => req(`/notes/${id}/revisions`, { method: "POST" }),
    deleteRevision: (noteId, revisionId) => req(`/notes/${noteId}/revisions/${revisionId}`, { method: "DELETE" }),
    markNoteRead: (id) => req(`/notes/${id}/read`, { method: "POST" }),
    listUnread: (noteIds) => (noteIds.length === 0 ? Promise.resolve([]) : req(`/notes/unread?ids=${noteIds.join(",")}`)),
    listSystemPrincipals(organizationId, opts = {}) {
      const params = new URLSearchParams({ organization_id: organizationId });
      if (opts.limit !== undefined) params.set("limit", String(opts.limit));
      if (opts.offset !== undefined) params.set("offset", String(opts.offset));
      return req(`/system-principals?${params.toString()}`);
    },
  };
}
