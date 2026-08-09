# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Tack** is a standalone Notes & Pages content platform UI for the Ullav ecosystem — see `/Users/colin/github/CLAUDE.md` for full workspace context. It is the frontend for `tack-server`.

Tack provides two content types on one shared platform:
- **Notes** — threaded, entity-attached comments/dialogs (private / team / global visibility), markdown-based.
- **Pages** — Confluence/Notion-class hierarchical long-form documents, organized into spaces, with real-time collaborative editing and live (never denormalized) cross-references into other Ullav apps.

This is currently **Phase 1**: Tack is being built as a first-class, standalone Ullav Platform app in its own right — not a throwaway test harness — held to the same design/UX bar as togra/clann-webapp/lagan, while also serving as the proving ground for the platform's design before any existing Ullav app is migrated onto it. No existing Ullav app/service is being modified at this stage.

- **Primary colour:** rose-700 (`#be123c`) — chosen to be distinct from every other first-party app's palette (Clann: emerald-700, Cartlann: teal-600, Comad: blue-700, Obair: orange-700, Togra: violet-600/700) while staying muted rather than a loud/bright red.
- **App icon:** `src/app/icon.svg` (thumbtack glyph on a rose-700 rounded-square background, following the same flat-geometric style as `togra/src/app/icon.svg`), picked up automatically by Next.js's built-in icon convention.

- **Dev port:** 3010 (`npm run dev` → `http://localhost:3010`) — next free port after togra (3006), cunav (3008), lagan (3009).
- **Auth service:** ullav-user-management on port 8081
- **API backend:** tack-server, reserved on port 8087 (not yet built — see Phase 1 note below)
- **localStorage keys:** `tack_auth` (session), `tack_active_team_id` (team switcher)

## Tech Stack

- **Framework:** Next.js 16 (App Router) + TypeScript + Tailwind CSS v4, matching togra/clann-webapp conventions (next-intl for i18n — locales `en`/`de`/`ga`, no `window.confirm`/`alert`, avatar/initials-pill fallback pattern, idle-timeout session with a warning modal, etc.)
- **Auth:** `ullav-user-management`, same JWT pattern as every other first-party Ullav frontend. Team switching (`TeamContext`/`TeamSelector`) reads `GET /teams` from ullav-user-management directly — this has no dependency on tack-server, so it works even before the backend exists.
- **Access gating:** mirrors togra's team-product-gate pattern — a team must have the `tack` product slug enabled (via ullav-user-management admin) for its members to log in or SSO into Tack. This product slug needs registering in ullav-user-management before real login can succeed end-to-end (an admin/ops task, not app code).
- **Component reuse:** reuse existing shared local packages where they fit (e.g. `DamPicker`, currently duplicated per-repo in `togra/packages/dam-picker` and `clann-webapp/packages/dam-picker`) rather than rebuilding equivalent UI from scratch — not yet wired in, since Notes/Pages content UI (where DAM embeds matter) hasn't been built yet.
- **Build for reuse:** Tack's own core pieces (note-thread view, TipTap+Yjs page editor, reference/mention picker) should be factored into embeddable local packages from the start (mirroring the `packages/dam-picker` pattern), since other Ullav apps will pull these in during later migration phases.

## Current State (Phase 1, auth/i18n bootstrap + Notes/Pages content UI)

Login, i18n (en/de/ga), user profile (first/last name + avatar via `MyDetailsModal`), and team switching are implemented, matching togra/cunav/lagan's patterns exactly (see `src/contexts/AuthContext.tsx`, `src/contexts/TeamContext.tsx`, `src/lib/auth-api.ts`, `src/components/Nav.tsx`). `tack-server` now exists and is wired up (`API_URL`, default port 8087, via the `/api/*` proxy rule in `src/proxy.ts`).

Notes and Pages content UI is implemented against `tack-server`'s REST API (`src/lib/tack-server-api.ts`): the left-hand `Navigator` — a search box, then **Notes** and **Spaces** as two tabs (not one long stacked panel), active tab persisted to `localStorage` — and the right-hand `NoteThread`/`PageEditor` detail panes, with version history, page cross-references, and export (Markdown/HTML/PDF) — see each component's own doc comment for specifics.

Notes support flat, per-team folders via `NoteTree` (a real two-level tree, structured directly on `PageTree`'s pattern — not a filter bolted onto a flat list, which an earlier pass shipped and had to be corrected): create/rename/delete a folder, expand-to-browse its notes, and file/move/unfile a note via a `NoteThread` selector. Every note lives in a folder — one filed nowhere else lives in an always-present virtual "Default" folder rather than sitting loose at the tree's root, so there's no bare/uncontained note anywhere in the tree. "+ Add folder" is pinned at the top (the one tree-level create action); "+ Add note" lives inside each folder (Default included), since a note is always created *into* some folder. Matches tack-server's `note_folders`, deliberately non-nested.

Spaces and Pages get the same "+ Add" placement (top-of-list) and hover-reveal rename affordance as Notes folders — a Space or Page's title can be renamed directly from the tree (`PATCH /spaces/:id`, `PATCH /pages/:id`), not just from inside `PageEditor`. Folder/space/page lists are re-sorted client-side after every create/rename (`sortFolders`/`sortSpaces`/`sortPages`), on top of the backend's own case-insensitive `ORDER BY lower(name)` — the backend sort alone only covers the initial fetch, not a list that's since been edited.

`TeamAvatar` renders a team's `avatar_url` as a plain HTTPS image (unlike togra's `TeamAvatar`, which resolves Comad DAM asset thumbnails through an authenticated proxy) — Tack has no DAM proxy yet, so that richer behaviour is deferred until DAM integration lands alongside the Notes/Pages content features.

## Branch Policy

Feature branches merge to `main` via PR; do not commit directly to `main`.
