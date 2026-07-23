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

## Current State (Phase 1, auth/i18n bootstrap)

Login, i18n (en/de/ga), user profile (first/last name + avatar via `MyDetailsModal`), and team switching are implemented, matching togra/cunav/lagan's patterns exactly (see `src/contexts/AuthContext.tsx`, `src/contexts/TeamContext.tsx`, `src/lib/auth-api.ts`, `src/components/Nav.tsx`). There is no Notes/Pages content UI yet, and `tack-server` doesn't exist as code yet — the `/api/*` proxy rule in `src/proxy.ts` is wired ahead of that, pointing at the reserved port 8087.

`TeamAvatar` renders a team's `avatar_url` as a plain HTTPS image (unlike togra's `TeamAvatar`, which resolves Comad DAM asset thumbnails through an authenticated proxy) — Tack has no DAM proxy yet, so that richer behaviour is deferred until DAM integration lands alongside the Notes/Pages content features.

## Branch Policy

Feature branches merge to `main` via PR; do not commit directly to `main`.
