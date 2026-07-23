# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Tack** is a standalone Notes & Pages content platform UI for the Ullav ecosystem — see `/Users/colin/github/CLAUDE.md` for full workspace context. It is the frontend for `tack-server`.

Tack provides two content types on one shared platform:
- **Notes** — threaded, entity-attached comments/dialogs (private / team / global visibility), markdown-based.
- **Pages** — Confluence/Notion-class hierarchical long-form documents, organized into spaces, with real-time collaborative editing and live (never denormalized) cross-references into other Ullav apps.

This is currently **Phase 1**: Tack is being built as a first-class, standalone Ullav Platform app in its own right — not a throwaway test harness — held to the same design/UX bar as togra/clann-webapp/lagan, while also serving as the proving ground for the platform's design before any existing Ullav app is migrated onto it. No existing Ullav app/service is being modified at this stage.

- **Primary colour:** rose-700 (`#be123c`) — chosen to be distinct from every other first-party app's palette (Clann: emerald-700, Cartlann: teal-600, Comad: blue-700, Obair: orange-700, Togra: violet-600/700) while staying muted rather than a loud/bright red.
- **App icon:** `icon.svg` at the repo root (thumbtack glyph on a rose-700 rounded-square background, following the same flat-geometric style as `togra/src/app/icon.svg`) — move into `src/app/icon.svg` once the Next.js app is scaffolded, per Next.js's built-in icon convention.

## Tech Stack

- **Framework:** Next.js (App Router) + TypeScript + Tailwind CSS, matching togra/clann-webapp conventions (next-intl for i18n, no `window.confirm`/`alert`, avatar/initials-pill fallback pattern, etc.)
- **Auth:** `ullav-user-management`, same JWT pattern as every other first-party Ullav frontend
- **Component reuse:** reuse existing shared local packages where they fit (e.g. `DamPicker`, currently duplicated per-repo in `togra/packages/dam-picker` and `clann-webapp/packages/dam-picker`) rather than rebuilding equivalent UI from scratch
- **Build for reuse:** Tack's own core pieces (note-thread view, TipTap+Yjs page editor, reference/mention picker) should be factored into embeddable local packages from the start (mirroring the `packages/dam-picker` pattern), since other Ullav apps will pull these in during later migration phases

## Branch Policy

Feature branches merge to `main` via PR; do not commit directly to `main`.
