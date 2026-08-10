# @ullav-dev/tack-notes

Embeddable Notes UI (thread view + folder tree), backed by
[tack-server](https://github.com/ullav-dev/tack-server). Extracted out of
[`tack`](https://github.com/ullav-dev/tack)'s own `NoteThread`/`NoteTree` —
see that repo's `CLAUDE.md` and the AWE-apps Notes migration plan for why.
`tack` itself consumes this package as its own Notes UI (dogfooding), not a
special first-party copy.

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

## Exports

- `TackNoteThread`, `TackNoteTree` — the two panels.
- `NoteEventsProvider`, `useNoteEvents`
- `createTackNotesApi`
- Types: `Note`, `NoteFolder`, `NoteFoldersPage`, `NoteRevision`,
  `NotesPage`, `NoteRead`, `NoteUnreadStatus`, `SystemPrincipal`,
  `SystemPrincipalsPage`, `TackNotesApi`, `TFunction`, `Visibility`
- `NoteMarkdown`, `markdownToHtml` — the plain markdown renderer, exported in
  case a host app wants it standalone (e.g. rendering a note preview
  outside the thread view).
