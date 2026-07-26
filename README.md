# tack

The Next.js frontend for **Tack** — a standalone Notes & Pages content platform for the Ullav ecosystem.

Tack is a first-class Ullav Platform app in its own right (held to the same design/UX bar as Togra/Clann/Lagan), not a throwaway test harness — it also happens to serve as the proving ground for the [`tack-server`](https://github.com/ullav-dev/tack-server) platform's design.

## Status

**Phase 1 is complete.** Every feature below is implemented, built, and (beyond a few flagged browser-only click-throughs) live-verified against real running infrastructure.

## Features

- **Workspace shell** — resizable Navigator (lazy-loaded Space/Page tree + paginated Notes list + live hybrid search), full-width layout.
- **Notes** — threaded markdown comments (private/team/organization visibility), inline title editing, explicit "Save as version" history with reply-to-version scoping (a reply stays attached to the version it was written against, not silently reattributed to a later edit), author names resolved from the team roster, manual/auto refresh (Notes have no live sync).
- **Pages** — real-time collaborative editing (TipTap + Yjs, synced via [`tack-hocuspocus`](https://github.com/ullav-dev/tack-hocuspocus)), live presence indicators, tables, explicit named-snapshot version history, delete (blocked while a page still has children, to avoid orphaning), page-to-page cross-references with a search-and-insert picker and a References/Backlinks panel that visibly surfaces broken links rather than erroring.
- **DAM asset embedding** — insert a Comad asset into a Note (as a markdown image link) or a Page (as a first-class `damAsset` TipTap node), via a shared draggable asset picker (`packages/dam-picker`).
- **Export** — Markdown/HTML download and browser print-to-PDF for both content types, with `print:` Tailwind styling on every piece of chrome so the printed/exported output only ever shows the content itself. Exporting a non-latest version prompts for confirmation and stamps the output as superseded.
- **i18n** — English, German, and Irish, via `next-intl`.

## Tech stack

- **Framework**: Next.js 16 (App Router) + TypeScript + Tailwind CSS v4
- **Editor**: [TipTap](https://tiptap.dev/) + [Yjs](https://docs.yjs.dev/) (real-time collaboration via [`@hocuspocus/provider`](https://tiptap.dev/docs/hocuspocus)), `tiptap-markdown` for Markdown export
- **Notes rendering**: `react-markdown` + `remark-gfm`
- **i18n**: `next-intl` (locales: `en`, `de`, `ga`)
- **Auth**: `ullav-user-management`, same JWT pattern as every other first-party Ullav frontend

## Getting started

### Prerequisites

- Node 22+
- A running [`tack-server`](https://github.com/ullav-dev/tack-server) instance (port 8087)
- A running [`tack-hocuspocus`](https://github.com/ullav-dev/tack-hocuspocus) instance (port 8088), for Page editing
- A running `ullav-user-management` instance (port 8081), for auth
- Optionally, a running `ullav-dam-server` instance (port 8080), for DAM asset embedding

### Configuration

Copy `.env.example` to `.env.local`:

```bash
API_URL=http://localhost:8087   # server-side only (tack-server)
AUTH_URL=http://localhost:8081  # server-side only (ullav-user-management)
DAM_URL=http://localhost:8080   # server-side only (ullav-dam-server), proxied at /api/dam/*
NEXT_PUBLIC_IDLE_TIMEOUT_MS=3600000  # optional, default 1 hour
NEXT_PUBLIC_HOCUSPOCUS_URL=ws://localhost:8088  # tack-hocuspocus -- connected to directly
                                                 # from the browser, NOT proxied via /api
                                                 # (WebSocket upgrades don't reliably survive
                                                 # Next.js middleware rewrites)
```

A team must have the `tack` product slug enabled in `ullav-user-management` for its members to log in.

### Running locally

```bash
npm install
npm run dev     # http://localhost:3010
```

### Tests & build

```bash
npm test
npm run build
```

## Project layout

```
src/
  app/[locale]/(workspace)/   — Spaces/Pages/Notes routes (route-group-scoped, persistent Navigator)
  components/                 — PageEditor, NoteThread, Navigator, PageTree, EditorToolbar, ...
  contexts/                    — AuthContext, TeamContext, PageEventsContext, NoteEventsContext
  lib/                         — tack-server-api.ts (typed API client), export.ts, auth-api.ts
  tiptap/                      — DamAssetNode, PageReferenceNode (custom TipTap extensions)
packages/
  dam-picker/                  — embeddable Comad asset picker (per-repo copy convention,
                                  shared in shape with togra/clann-webapp's own copies)
messages/                      — en/de/ga translations
```

## Related repos

- [`tack-server`](https://github.com/ullav-dev/tack-server) — the Rust/Postgres/OpenSearch backend
- [`tack-hocuspocus`](https://github.com/ullav-dev/tack-hocuspocus) — real-time Yjs sync server for collaborative Page editing

## Branch policy

Feature branches merge to `main` via PR — never commit directly to `main`.
