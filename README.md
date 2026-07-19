<div align="center">
  <img src=".github/muninn.png" width="120" alt="Muninn" />
  <h1>Muninn</h1>
  <p>Self-hosted app launcher and bookmark manager with a live-widget tile dashboard, owner-scoped sharing, and a REST API that covers every layout change.</p>

  <p>
    <a href="https://github.com/Emkraan/muninn/releases"><img src="https://img.shields.io/github/v/release/Emkraan/muninn?style=for-the-badge" alt="Release" /></a>
    <a href="https://github.com/Emkraan/muninn/pkgs/container/muninn"><img src="https://img.shields.io/badge/ghcr.io-emkraan%2Fmuninn-2486B9?style=for-the-badge&logo=docker&logoColor=white" alt="Container image" /></a>
    <a href="https://github.com/Emkraan/muninn/actions/workflows/build-and-deploy.yml"><img src="https://img.shields.io/github/actions/workflow/status/Emkraan/muninn/build-and-deploy.yml?style=for-the-badge" alt="Build" /></a>
    <a href="LICENSE.md"><img src="https://img.shields.io/badge/license-AGPL--3.0-4A9FE0?style=for-the-badge" alt="License" /></a>
  </p>
</div>

---

## Contents

- [What Muninn is](#what-muninn-is)
- [Features](#features)
- [Requirements](#requirements)
- [Deployment](#deployment)
- [Data volume](#data-volume)
- [Environment variables](#environment-variables)
- [Authentication](#authentication)
- [Roles and permissions](#roles-and-permissions)
- [Audit log](#audit-log)
- [Widgets](#widgets)
- [Architecture](#architecture)
- [Local development](#local-development)
- [Troubleshooting](#troubleshooting)
- [License](#license)
- [Credits and attribution](#credits-and-attribution)
- [The name](#the-name)

---

## What Muninn is

Muninn is a fork of [Linkwarden](https://github.com/linkwarden/linkwarden) that
adds a Homarr-style live-widget **board** on top of Linkwarden's owner-scoped
collections and full REST API. It is meant to be a homelab / household app
launcher: your services and bookmarks organized into boards of tiles, with live
status widgets (torrents, media requests, indexer health, an arbitrary
Prometheus stat, uptime, calendar) rendered inline.

The reason for the fork is a single design property: **every layout change is a
REST call.** Boards, sections, item positions - a full board reorganization is
scriptable end to end with zero UI interaction. It also keeps Linkwarden's real
per-user data isolation (a private board or collection is genuinely private,
with opt-in granular sharing) and fixes the upstream bug where disabling public
registration also disabled admin-side user creation.

## Features

- **Tile dashboard (boards).** Group links and live widgets into sections; each
  board is owner-scoped with opt-in per-member create/update/delete/manage
  permissions.
- **Complete layout API.** Versioned `/api/v1/boards/*` endpoints for boards,
  sections, items, single and bulk repositioning, members, and the widget-type
  registry. A whole board reorg is one `PATCH .../items/positions` call.
- **Live widgets, configuration-driven.** Built-in qBittorrent, Overseerr,
  Prowlarr, a generic PromQL stat tile, ping/uptime, and calendar (ICS). All
  endpoints and credentials are supplied per item at runtime - nothing is
  hardcoded. Register custom declarative widget types via the API.
- **Real per-user isolation.** A board/collection with no members beyond its
  owner is fully private; link tiles re-check the underlying link's read
  permission live, so board sharing can never leak a link you couldn't read.
- **Admin can always provision users.** Public registration can be closed while
  admins (or an SSO group) still create users - the fix for Linkwarden #984.
- **Tamper-evident audit log.** Append-only, hash-chained admin audit trail with
  a verify endpoint.
- **Provider-agnostic SSO.** Any OIDC provider via env config (Microsoft Entra
  ID, Authelia, Authentik, Keycloak, ...), plus local password auth.
- Everything Linkwarden already does: bookmarks, collections, tags, full-text
  search (Meilisearch), and archiving (screenshot / PDF / Monolith / Wayback).

## Requirements

| Component | Requirement |
| --- | --- |
| Runtime | Docker (the published image runs the app + background worker) |
| Database | PostgreSQL 16+ (a dedicated instance or a database on a shared cluster) |
| Search | Meilisearch v1.12+ (optional; enables full-text search) |
| Reverse proxy | Any (Traefik, Caddy, nginx, ...) terminating TLS in front of the app |

## Deployment

Muninn ships as a single container image, `ghcr.io/emkraan/muninn`, that runs
both the web app and the background worker and applies database migrations on
start. Deploy it with the bundled Compose file or drop the image into your own
stack.

```yaml
# docker-compose.yml (excerpt - see the repo file for the full version)
services:
  postgres:
    image: postgres:16-alpine
    env_file: .env
    restart: always
    volumes:
      - ./pgdata:/var/lib/postgresql/data
  meilisearch:
    image: getmeili/meilisearch:v1.12.8
    env_file: .env
    restart: always
    volumes:
      - ./meili_data:/meili_data
  muninn:
    image: ghcr.io/emkraan/muninn:latest   # pin to a released version in production
    env_file: .env
    environment:
      - DATABASE_URL=postgresql://postgres:${POSTGRES_PASSWORD}@postgres:5432/postgres
    restart: always
    ports:
      - 3000:3000
    volumes:
      - ./data:/data/data
    depends_on: [postgres, meilisearch]
```

1. `cp .env.example .env` and fill in the required values (see below).
2. Generate secrets: `openssl rand -base64 32` for `NEXTAUTH_SECRET`, `MEILI_MASTER_KEY`, and `AUDIT_HMAC_SECRET`.
3. Set `NEXTAUTH_URL` to your public origin + `/api/v1/auth`.
4. `docker compose up -d`.
5. Open the app, create the first account (this becomes admin id 1), then set `NEXT_PUBLIC_DISABLE_REGISTRATION=true` and redeploy to close signups.
6. Verify: `curl -fsS http://localhost:3000/api/v1/health` returns `{"ok":true,...}`.

**Pin the image in production.** Use a released tag (`ghcr.io/emkraan/muninn:0.1.0`)
or an immutable `sha-<commit>` tag rather than `:latest`, and bump deliberately.

> How the maintainers run it: as a git-backed Portainer stack behind Pangolin
> with Entra ID SSO and secrets from Azure Key Vault. That wiring lives in a
> separate private repo and is **not** required to self-host Muninn.

## Data volume

Persist three paths so nothing is lost across restarts/redeploys:

| Path in container | Purpose |
| --- | --- |
| Postgres data dir | all boards, links, collections, users, audit log |
| `/meili_data` | search index (rebuildable, but nicer to keep) |
| `/data/data` | archived link content (screenshots, PDFs, Monolith) |

## Environment variables

Every variable Muninn reads is documented in [`.env.example`](.env.example).
The important ones:

| Variable | Required | Purpose |
| --- | --- | --- |
| `NEXTAUTH_URL` | yes | Public origin + `/api/v1/auth` |
| `NEXTAUTH_SECRET` | yes | Signs sessions/JWTs (32+ bytes) |
| `DATABASE_URL` / `POSTGRES_PASSWORD` | yes | PostgreSQL connection |
| `MEILI_HOST` / `MEILI_MASTER_KEY` | no | Full-text search |
| `NEXT_PUBLIC_DISABLE_REGISTRATION` | no | Close public signups (admins still provision) |
| `NEXT_PUBLIC_ADMIN` | no | Bootstrap admin user id (default 1) |
| `SUPER_ADMIN_EMAILS` | no | Break-glass admin allowlist (never lock out) |
| `AUDIT_HMAC_SECRET` | recommended | Tamper-evident audit chain HMAC key |
| `NEXT_PUBLIC_AZURE_AD_ENABLED` + `AZURE_AD_*` | no | Microsoft Entra ID SSO |
| `NEXT_PUBLIC_OIDC_ENABLED` + `OIDC_*` | no | Any generic OIDC provider |

## Authentication

Local email/password works out of the box. For SSO, Muninn is
provider-agnostic - configure any OIDC provider through environment variables
(no provider is hardcoded). For Microsoft Entra ID, register the redirect URI
`<your origin>/api/v1/auth/callback/azure-ad`. You can run SSO-only by disabling
credential auth.

## Roles and permissions

- **Data-level:** boards and collections have one owner plus members with
  explicit `create` / `update` / `delete` flags (boards add `manage`). Read is
  implied by ownership or membership; there is no separate read flag. A resource
  with no members is private to its owner.
- **Instance admin:** resolved by `isServerAdmin` in this order - the DB
  `isAdmin` role, the `NEXT_PUBLIC_ADMIN` bootstrap id, or a `SUPER_ADMIN_EMAILS`
  entry. Admins can provision users even when public registration is disabled.

## Audit log

Administrative actions (user creation, widget-type changes, ...) are recorded in
an append-only, hash-chained audit log: each row's `hash` is
`HMAC-SHA256(AUDIT_HMAC_SECRET, canonical(entry + prevHash))`. It is never
pruned. Read it at `GET /api/v1/admin/audit`; verify chain integrity at
`GET /api/v1/admin/audit/verify` (both admin-only).

## Widgets

Each widget type declares a JSON-Schema config and a `fetchStatus(config)` that
returns a normalized payload (metrics + list items + health). Discover the
registry at `GET /api/v1/widget-types`; test a config at
`POST /api/v1/widgets/preview`; a board item polls
`GET /api/v1/boards/:id/items/:itemId/widget-status` at the type's refresh
cadence. Built-ins: `qbittorrent`, `overseerr`, `prowlarr`, `prom-stat`,
`ping`, `calendar`. Admins can register custom declarative HTTP widget types
without touching source.

## Architecture

Next.js (pages router) + Prisma + PostgreSQL + Meilisearch, plus a background
worker - the same stack as Linkwarden. Muninn adds the `Board` / `Section` /
`BoardItem` / `BoardMember` models, the `WidgetType` registry and `AdminAudit`
models, the `/api/v1/boards/*` and `/api/v1/widget-types` API, a server-side
widget framework (`apps/web/lib/widgets`), and the Cobalt UI theme. The internal
`@linkwarden/*` workspace package names are kept intentionally.

## Local development

```bash
corepack enable
yarn install
cp .env.example .env   # set DATABASE_URL, NEXTAUTH_SECRET, NEXTAUTH_URL
yarn prisma:dev        # apply migrations to a dev database
yarn concurrently:dev  # web + worker
```

Type-check: `yarn workspace @linkwarden/web exec tsc --noEmit`. Unit tests:
`yarn vitest run`. Ship-gate integration tests live in [`tests/gates`](tests/gates).

## Troubleshooting

- **Container restarts on boot** - the preflight fails fast if a required secret
  (`NEXTAUTH_SECRET`, `DATABASE_URL`, `NEXTAUTH_URL`) is missing. Check logs.
- **Search not working** - `MEILI_HOST` / `MEILI_MASTER_KEY` unset; search is
  optional and simply disabled without them.
- **Admin can't add users** - ensure the caller is an admin
  (`isAdmin`, `NEXT_PUBLIC_ADMIN`, or `SUPER_ADMIN_EMAILS`); that is exactly the
  path Muninn fixes relative to upstream.

## License

Muninn is licensed under the **GNU Affero General Public License v3.0**
([LICENSE.md](LICENSE.md)), inherited from Linkwarden. If you run a modified
Muninn as a network service, AGPL-3.0 requires you to offer users the
corresponding source.

## Credits and attribution

Muninn is a derivative work of **Linkwarden**
(Copyright (C) Linkwarden, https://github.com/linkwarden/linkwarden), used and
distributed under AGPL-3.0. See [`NOTICE`](NOTICE) for the fork chain, the dated
list of modifications (AGPL-3.0 section 5(a)), and bundled third-party
components. Huge thanks to the Linkwarden maintainers.

## The name

**Muninn** ("Memory") is one of Odin's two ravens who fly across the world each
day gathering information and report back to him - a fit for a tool that
remembers everything you've organized and reports live status back to one place.
Its sibling raven **Huginn** ("Thought") was considered and passed over: an
unrelated automation-agent project already uses that name.
