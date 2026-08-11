# @ullav-dev/tack-notes

Embeddable Notes UI, backed by
[tack-server](https://github.com/ullav-dev/tack-server). Extracted out of
[`tack`](https://github.com/ullav-dev/tack)'s own `NoteThread`/`NoteTree` —
see that repo's `CLAUDE.md` and the AWE-apps Notes migration plan for why.
`tack` itself consumes this package as its own Notes UI (dogfooding), not a
special first-party copy.

Three top-level components, for two different information architectures:

- **`TackNoteTree` + `TackNoteThread`** — tack's own app: browse a whole
  team's notes by folder (a Confluence-style Navigator), then view one.
- **`TackNotesPanel`** — everything else. Every AWE-based app's own
  `NotesPanel` (cunav, togra, awe-client) attaches notes to one specific
  entity (a ticket, a workflow, a job) — there's no folder browsing, just
  "the notes on this thing." `TackNotesPanel` lists via
  `GET /notes/by-entity`, composes `TackNoteThread` for the selected note's
  detail, and is very likely the component your app wants, not the tree.

## Design: everything host-app-specific is a prop, nothing is assumed

The original `tack` components reached directly into `tack`'s own
`AuthContext`/`TeamContext`/`next-intl`/router/team-roster hook. None of
that travels with the package — every host app supplies its own:

- **Auth**: `currentUserId: string`, `isAdmin: boolean` — not read from a
  context.
- **API client**: `createTackNotesApi(baseUrl, token)` (mirrors
  `@ullav-dev/dam-picker`'s `createDamClient(base, token)`) — point it at
  your own proxy prefix (e.g. `/api/tack`), or tack-server directly.
- **Scope**: a `teamId` prop, not a team-switcher context.
- **Routing**: `TackNoteTree` takes `buildNoteHref(noteId)` + `onNavigate(noteId)`
  + an optional `LinkComponent` (defaults to a plain `<a>`); `TackNoteThread`
  takes `onNavigateAfterDelete()`. Nothing assumes Next's
  `next-intl`-wrapped router or a `/notes/:id` route shape, and
  `TackNoteTree` takes `selectedNoteId` as a plain prop instead of reading
  a route param itself.
- **Entity-scoped folders**: `TackNoteThread` takes an optional `folders`
  prop -- when given, it's used as-is for the note's own folder-move
  selector instead of the default self-fetch (`api.listNoteFolders(note.
  team_id)`, tack-server's team-wide folders). `TackNotesPanel` passes its
  own entity-scoped list here, since a team-wide fetch would never include
  those folders. Leave unset for `TackNoteTree`'s usage (the default).
- **Roster**: `resolveAuthor(userId, teamId): string` — `teamId` is the
  note's own `team_id` (only known once `TackNoteThread` has loaded it, so
  this can't be a plain `(userId) => string` the host app pre-resolves up
  front). You decide how it becomes a display name (team roster,
  system-principal lookup, or a mix — see tack-server's `system_principals`).
- **i18n**: translator function props, `(key, params?) => string` — the
  exact shape `next-intl`'s `useTranslations()` already returns, so a host
  app on `next-intl` can pass that straight through. `TackNoteThread` takes
  one, `t` (the `notes` namespace). `TackNoteTree` takes two: `t` (the
  `navigator` namespace) and `tNotes` (`notes`, for its inline note
  composer, which shares strings with the thread view). See "String keys"
  below for the exact key list — copy the `notes`/`navigator` blocks out of
  `tack/messages/{en,de,ga}.json` to seed your own catalogue rather than
  inventing a second source of truth.
- **Theming**: no hardcoded `rose-*` Tailwind classes. Every accent-colored
  utility uses CSS custom properties with tack's own rose values as the
  fallback (e.g. `bg-[var(--tnotes-700,#be123c)]`) — override
  `--tnotes-50/100/200/300/400/700/800/900` on a wrapping element (or
  globally) to match your app's own brand color. Neutral/status colors
  (slate for chrome, amber for warnings, red for destructive actions) are
  left as-is — those aren't brand-specific and are consistent across every
  first-party Ullav app already.
- **Image embedding**: optional `ImagePicker` component prop
  (`{ onSelect: (asset: {url: string; name: string}) => void; onClose: () => void }`)
  for the markdown toolbar's "Insert image" button — omit it and the button
  simply doesn't render. Lets `tack` keep using its own `DamPickerModal`
  without forcing every consumer to have DAM wired up.

## Event bus

`NoteEventsProvider`/`useNoteEvents` (title edits, folder moves, deletions,
and a shared refresh-trigger pub/sub between the tree and thread panels) is
bundled as an internal implementation detail — host apps wrap both panels in
one `<NoteEventsProvider>` and never see the context itself, except to call
`useNoteEvents().triggerRefresh()` from their own refresh control, if they
have one.

## String keys

`TackNoteThread` calls (namespace `notes`): `cancel`, `close`, `createVersion`,
`delete`, `deleteCancel`, `deleteConfirm`, `deleteNote`,
`deleteNoteConfirmBody`, `deleteNoteConfirmTitle`, `deleteVersionConfirm`,
`edit`, `editedBy`, `editedSinceSave`, `exportHtml`, `exportMarkdown`,
`exportOldVersionConfirm`, `exportOldVersionConfirmBody`,
`exportOldVersionConfirmTitle`, `exportPdf`, `folderUnfiled`, `history`,
`loading`, `noVersions`, `nothingToPreview`, `olderReplies`, `preview`,
`reply`, `replyPlaceholder`, `save`, `saving`, `showLatest`,
`supersededStampHtml`, `supersededStampMarkdown`, `titlePlaceholder`,
`version`, `versionCreated`, `versionHistory`, `viewThisVersion`,
`viewingOldVersion`, `visibility.organization`, `visibility.private`,
`visibility.team`, `write`.

`TackNoteTree` calls (namespace `navigator`, via `t`): `defaultFolder`,
`deleteFolder`, `deleteFolderCancel`, `deleteFolderConfirmBodyEmpty`,
`deleteFolderConfirmBodyWithNotes`, `deleteFolderConfirmTitle`, `deleting`,
`loading`, `newFolder`, `newFolderName`, `newNote`, `noNotes`, `pagerNext`,
`pagerPageOf`, `pagerPrev`, `renameFolder`, `selectTeamFirst`,
`untitledNote`; and (namespace `notes`, via `tNotes`): `cancel`, `save`,
`saving`, `titlePlaceholder`, `visibility.organization`, `visibility.private`,
`visibility.team`.

`TackNotesPanel` calls (namespace `notes`, via `t` — a superset of
`TackNoteThread`'s own list above, since it renders `TackNoteThread` directly
for the detail pane): everything `TackNoteThread` needs, plus `addNote`,
`backToList`, `deleteFolder`, `folderFilterAll`, `folderFilterMine`,
`folderFilterShared`, `newFolder`, `newFolderName`, `noNotes`,
`renameFolder`, `selectNote`, `unread`, `untitled`.

## Exports

- `TackNoteThread`, `TackNoteTree` — tack's own app's two panels.
- `TackNotesPanel` — the entity-attached notes widget every other app wants;
  see the intro above.
- `NoteEventsProvider`, `useNoteEvents`
- `createTackNotesApi`
- Types: `AttachRequest`, `Note`, `NoteFolder`, `NoteFoldersPage`,
  `NoteRevision`, `NotesPage`, `NoteRead`, `NoteUnreadStatus`,
  `SystemPrincipal`, `SystemPrincipalsPage`, `TackNotesApi`, `TFunction`,
  `Visibility`
- `NoteMarkdown`, `markdownToHtml` — the plain markdown renderer, exported in
  case a host app wants it standalone (e.g. rendering a note preview
  outside the thread view).

## `TackNotesPanel` props

`api`, `owningService`, `entityType`, `entityId`, `teamId`, `currentUserId`,
`isAdmin`, `resolveAuthor`, `t` are required — the rest have defaults and
cover every layout/behavior mode the existing per-app `NotesPanel`s already
proved necessary:

- `editable` (default `true`) — create/reply at all.
- `showFolders` (default `true`) — quick "all"/"mine"/"shared" filter chips
  plus real folder create/rename/delete. `false` for a minimal list with no
  folder chrome at all. When on, also passed straight into the detail
  pane's own folder-move selector via `TackNoteThread`'s `folders` prop,
  instead of that component's default team-wide self-fetch.
- `folderScope` (default `"entity"`) — where those folder chips come from:
  - `"entity"` — this one entity's own folders (`GET /note-folders/by-
    entity`, tack-server's entity-scoped folders) — cunav's model, a
    folder scoped to one ticket.
  - `"team"` — the caller's whole team folder list (`GET /note-folders?
    team_id=`, tack-server's team-wide folders, the same ones `TackNoteTree`
    browses) — togra's model, one team-wide folder set any note (attached
    to any entity type) can be filed into. Fetched with a single generously
    large page (200), matching what togra's own pre-migration chip bar did
    (unpaginated) — a team's folder count growing past that is a
    pre-existing constraint carried over, not solved here; the chip-bar UI
    isn't built for a real `Pager` the way `NoteTree`'s browse view is.
- `compact` (default `false`) — narrower rows, smaller type; for a sidebar
  widget placement.
- `twoColumn` (default `false`) — list and detail side by side via a
  draggable `ResizableSplit`, instead of the default stacked
  "list, then detail in its place" layout.
- `autoSelectFirst` (default `false`) — select the first note once the
  initial list loads.
- `defaultVisibility` (default `"team"`) — preselected in the new-note form.
- `showUnreadBadges` (default `true`) — via `note_reads`; a note is marked
  read the moment it's opened.
- `refreshSignal` — bump to silently re-fetch the list in the background
  (e.g. a host app's own polling) without disturbing the current selection.
- `renderNoteActions(note)` — extra per-row actions (e.g. cunav's
  "send as email"); clicks inside it don't select the row.
- `ImagePicker` — same contract as `TackNoteThread`'s.
