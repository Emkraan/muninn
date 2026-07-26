<p align="center">
  <img src=".github/muninn.png" width="120" alt="Muninn">
</p>

<h1 align="center">Muninn</h1>

<p align="center">
  <b>A self-hosted dashboard and app launcher for your homelab, server, or business.</b><br>
  One tile board over your services, with strict per-user access, multi-provider sign-in, and a documented REST API.
</p>

<p align="center">
  <a href="https://github.com/Emkraan/muninn/releases"><img src="https://img.shields.io/github/v/release/Emkraan/muninn?style=for-the-badge&color=6366F1" alt="Latest release" /></a>
  <a href="https://github.com/Emkraan/muninn/pkgs/container/muninn"><img src="https://img.shields.io/badge/ghcr.io-emkraan%2Fmuninn-6366F1?style=for-the-badge&logo=github" alt="GHCR image" /></a>
  <a href="https://github.com/Emkraan/muninn/actions/workflows/build-and-deploy.yml"><img src="https://img.shields.io/github/actions/workflow/status/Emkraan/muninn/build-and-deploy.yml?style=for-the-badge" alt="Build status" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-Apache--2.0-blue?style=for-the-badge" alt="License Apache-2.0" /></a>
</p>

---

## Table of Contents

- [Features](#features)
- [Support](#support)
- [Requirements](#requirements)
- [Deployment](#deployment)
- [Data Volume](#data-volume)
- [Environment Variables](#environment-variables)
- [Authentication](#authentication)
- [Roles and Permissions](#roles-and-permissions)
- [Programmatic API](#programmatic-api)
- [Local Development](#local-development)
- [Troubleshooting](#troubleshooting)
- [License](#license)
- [Credits and Attribution](#credits-and-attribution)

---

## Features

Muninn is a fork of [Homarr](https://github.com/homarr-labs/homarr) that inherits its full dashboard and adds a cohesive first-party standard on top.

- **Live tile dashboard** - drag-and-drop grid boards over 50+ service integrations and 54 widgets (clock, calendar, media, downloads, system health, and more), with spotlight search, category and dynamic sections, and per-breakpoint layouts, all carried over from Homarr.
- **Strict per-user access control** - boards, apps, and integrations are private by default. An admin grants a specific user or group access to a specific resource through its own Access panel, so each person sees exactly what was shared with them and nothing else. Upstream Homarr, by contrast, shows every app to every logged-in user.
- **Multi-provider single sign-on** - add and manage any number of identity providers from the admin UI (Microsoft/Entra, Google, GitHub, Okta, Keycloak, Authentik, generic OIDC, or manual OAuth2). Providers are stored in the database and apply on the next sign-in with no restart, each with its own claim mapping, group-to-role mapping, and profile-picture pull.
- **Documented REST API** - a served OpenAPI spec at `/api/openapi`, an in-app API console, and an MCP endpoint at `/api/mcp`. API keys are per-key scoped and optionally expiring, and a key can never exceed its owner's permissions.
- **Board-as-code** - the whole board is customizable over REST: read and write entire boards, or make granular item and section changes. Every write uses optimistic concurrency, so a concurrent edit returns `409 Conflict` instead of silently clobbering the other change.
- **Cobalt UI** - a dark, logo-blue design system with a live animated background and a redesigned sign-in screen. An optional deployment-set footer credit keeps the published image brand-agnostic.
- **SQLite or Postgres, bundled or external Redis** - runs zero-config on a bundled SQLite file and an in-container Redis, or points at an external Postgres or MySQL (`DB_DRIVER`) and a shared or external Redis (`REDIS_IS_EXTERNAL`) to centralize state in a larger or multi-service deployment. A one-shot SQLite-to-Postgres copy tool ships inside the image.
- **Single container** - the image bundles the web server, a websocket service, and Redis, and serves on port 7575. Bring your own reverse proxy for HTTPS.

## Support

Muninn is free and open source, and always will be. If it is useful to you and you would like to support development:

<p>
  <a href="https://www.buymeacoffee.com/emkraan"><img src="https://img.buymeacoffee.com/button-api/?text=Buy%20me%20a%20drink&emoji=%F0%9F%8D%B9&slug=emkraan&button_colour=FF5F5F&font_colour=ffffff&font_family=Comic&outline_colour=000000&coffee_colour=FFDD00" alt="Buy Me a Coffee" height="44" /></a>
  &nbsp;
  <a href="https://www.paypal.com/ncp/payment/Z5LS6SWMFQGU4"><img src="https://img.shields.io/badge/PayPal-Donate-00457C?style=for-the-badge&logo=paypal&logoColor=white" alt="Donate via PayPal" height="44" /></a>
</p>

Entirely optional, and every feature stays free either way.

## Requirements

| Requirement | Details |
|---|---|
| Docker | Runs the single `ghcr.io/emkraan/muninn` container, which serves on port 7575. |
| Database | SQLite by default (zero-config, stored in the data volume). Postgres or MySQL optional via `DB_DRIVER` plus connection settings. |
| `SECRET_ENCRYPTION_KEY` | A 64-character hex secret that encrypts integration credentials in the database. Required in production. Supports the `_FILE` convention for Docker secrets. |
| Persistent volume | Mounted at `/appdata` for the database, cache, and trusted certificates. |
| Reverse proxy (recommended) | The container serves plain HTTP on 7575. Terminate TLS at an external reverse proxy, which is also required for secure OIDC redirect URIs. |

## Deployment

Muninn ships as a single container image at `ghcr.io/emkraan/muninn`.

### Image tags

| Tag | Meaning |
|---|---|
| `0.9.11` (semver) | An immutable, released version. Pin to this in production. |
| `latest` | The most recent released build. |
| `edge` | The current `main` branch. |

### Docker Compose (SQLite, the simplest setup)

```yaml
services:
  muninn:
    image: ghcr.io/emkraan/muninn:0.9.11
    container_name: muninn
    restart: unless-stopped
    ports:
      - "7575:7575"
    environment:
      - SECRET_ENCRYPTION_KEY_FILE=/run/secrets/secret_encryption_key
    volumes:
      - ./appdata:/appdata
      - ./secret_encryption_key:/run/secrets/secret_encryption_key:ro
```

Generate the encryption key once with `openssl rand -hex 32` and write it to `./secret_encryption_key`.

### First run

Bring the stack up, then open `http://<host>:7575`. Migrations run automatically at boot; complete the onboarding to create the administrator account.

### Pin to a version

There is no built-in auto-updater, by design. Pin a released semver tag and bump it deliberately when you want to update.

### External Postgres

To use an external Postgres server instead of the bundled SQLite file:

```yaml
    environment:
      - DB_DRIVER=node-postgres
      # postgresql://user:pass@host:5432/muninn
      - DB_URL_FILE=/run/secrets/db_url
      - SECRET_ENCRYPTION_KEY_FILE=/run/secrets/secret_encryption_key
```

### External Redis

Muninn bundles a Redis instance and uses it by default (zero-config). To point at
an external or centralized Redis instead of the bundled one:

```yaml
    environment:
      - REDIS_IS_EXTERNAL=true
      - REDIS_HOST=redis
      - REDIS_PORT=6379
      # optional: isolate Muninn's keys on a dedicated logical database
      - REDIS_DATABASE_INDEX=0
      # optional auth (supports the _FILE convention for Docker secrets)
      # - REDIS_PASSWORD_FILE=/run/secrets/redis_password
```

The bundled Redis is skipped when `REDIS_IS_EXTERNAL=true`.

## Data Volume

State lives under `/appdata`:

```
/appdata
|- db/
|  \- db.sqlite            # default SQLite database (all app state)
|- redis/                  # in-container Redis working dir (ephemeral)
\- trusted-certificates/   # operator-supplied CA certificates
```

Key behaviours:

- With the default SQLite driver, `/appdata/db/db.sqlite` holds all persistent state (boards, users, apps, integrations, API keys, and OIDC providers). Back this file up.
- With Postgres or MySQL, that state lives on the external database server and `/appdata/db` is unused.
- `/appdata/redis` and the bundled Redis process are ephemeral cache and queue state, rebuilt on restart.
- Migrations run against the database on every boot unless `DB_MIGRATIONS_DISABLED=true`.

## Environment Variables

Any variable ending in `_FILE` is resolved from the file at that path at boot, so every secret below supports Docker secrets (for example `SECRET_ENCRYPTION_KEY_FILE` or `DB_URL_FILE`). A full annotated list lives in [`.env.example`](.env.example).

### Core and security

| Variable | Default | Required | Purpose |
|---|---|---|---|
| `SECRET_ENCRYPTION_KEY` | none | Yes (production) | 64-hex-char key that encrypts integration secrets in the database. |
| `NODE_ENV` | `production` (image) | No | Runtime mode. |
| `LOG_LEVEL` | `info` | No | Log verbosity. |
| `PUID` / `PGID` | `0` / `0` | No | Drop-privilege UID and GID for the app process. |

### Database

| Variable | Default | Required | Purpose |
|---|---|---|---|
| `DB_DRIVER` | `better-sqlite3` | No | One of `better-sqlite3`, `node-postgres`, or `mysql2`. |
| `DB_URL` | `/appdata/db/db.sqlite` | For SQLite, or when `DB_HOST` is unset | Connection string, or the SQLite file path. |
| `DB_HOST` / `DB_PORT` / `DB_USER` / `DB_PASSWORD` / `DB_NAME` | - | For host-based Postgres or MySQL | Connection settings when not using `DB_URL`. |
| `DB_MIGRATIONS_DISABLED` | unset | No | Set `true` to skip boot migrations. |

### Authentication

| Variable | Default | Required | Purpose |
|---|---|---|---|
| `AUTH_PROVIDERS` | `credentials` | No | Comma-separated base providers (`credentials`, `ldap`). OIDC providers are managed in the admin UI, not here. |
| `AUTH_SESSION_EXPIRY_TIME` | `30d` | No | Session lifetime. |
| `AUTH_LDAP_*` | - | If `ldap` is enabled | LDAP bind configuration. |

### Redis

| Variable | Default | Required | Purpose |
|---|---|---|---|
| `REDIS_IS_EXTERNAL` | `false` | No | Use an external Redis instead of the bundled one. |
| `REDIS_HOST` / `REDIS_PORT` / `REDIS_USERNAME` / `REDIS_PASSWORD` | - | If external | External Redis connection. |

### Container and branding

| Variable | Default | Required | Purpose |
|---|---|---|---|
| `ENABLE_DOCKER` / `ENABLE_KUBERNETES` | `true` / `false` | No | Toggle the Docker and Kubernetes tools. |
| `DOCKER_SOCKET_PATHS` | `/var/run/docker.sock` | No | Docker or Podman socket paths. |
| `BRAND_ATTRIBUTION` | empty | No | Footer credit text. Empty keeps the build brand-agnostic. |
| `BRAND_ATTRIBUTION_LOGO` | empty | No | Footer credit logo (a URL or `data:` URI). |

## Authentication

Muninn ships with a local `credentials` login so you can create the first admin account. Beyond that, add any number of OIDC or OAuth2 identity providers from Manage, Authentication: Microsoft/Entra, Google, GitHub, Okta, Keycloak, Authentik, a generic OIDC provider, or a manual OAuth2 flow. Providers are stored in the database and take effect on the next sign-in with no restart. Each carries its own claim mapping, group-to-role mapping, and profile-picture pull. Secure OIDC redirect URIs require HTTPS, so put Muninn behind a TLS-terminating reverse proxy.

## Roles and Permissions

Nothing is shared by default. Boards, apps, and integrations are private to their creator until access is explicitly granted:

- Each resource has an Access panel where an admin grants a specific user or group `view`, `modify`, or `full` access.
- Group membership and fine-grained admin permissions (`other-manage-*`) gate the management surfaces.
- A user only ever sees the boards, apps, and integrations shared with them. Unauthorized access returns "not found" rather than revealing that a resource exists.

## Programmatic API

Muninn exposes a documented, versioned REST API.

- **OpenAPI spec** - served at `/api/openapi`, and rendered as an interactive console in-app at Manage, Tools, API.
- **MCP endpoint** - `/api/mcp`, generated from the same procedures for agent and tooling use.
- **API keys** - created under Manage, API keys. Each key is scoped (it can never exceed its owner's permissions) and optionally expires. Present a key in the `ApiKey` request header.
- **Board-as-code** - the whole board is customizable over REST. Read a board (`GET /api/boards/{id}`), write it back (`PUT /api/boards/{id}`), or make granular changes to items and sections (`.../items/{itemId}`, `.../sections/{sectionId}`). Board writes use optimistic concurrency: read the board's `version`, send it back as `expectedVersion`, and a concurrent edit returns `409 Conflict` instead of overwriting the other change.

## Local Development

Muninn is a pnpm and Turborepo monorepo (Next.js, Mantine, tRPC, Drizzle). Node 24 is required.

```bash
pnpm install
pnpm dev
```

Type-check and build the workspace with `pnpm typecheck` and `pnpm build`.

## Troubleshooting

- **Container exits right after start** - a boot migration failed, or `SECRET_ENCRYPTION_KEY` is missing or not 64 hex characters. Check the container logs; startup aborts on a failed migration.
- **Integrations show as broken after moving hosts** - `SECRET_ENCRYPTION_KEY` must stay identical to the key that was used when the integration secrets were saved, otherwise they cannot be decrypted.
- **OIDC sign-in fails on the redirect** - the identity provider needs an HTTPS redirect URI, so Muninn must be reached over HTTPS through your reverse proxy, not over the raw HTTP port.
- **"Update available" points at a Homarr version** - Muninn tracks its own releases at `ghcr.io/emkraan/muninn`; ignore upstream Homarr version prompts.

## License

Muninn is licensed under the [Apache License 2.0](LICENSE).

## Credits and Attribution

Muninn is a fork of [Homarr](https://github.com/homarr-labs/homarr) (based on Homarr v1.71.0), also under the Apache License 2.0. It inherits Homarr's dashboard, widgets, and integrations, with a first-party standard added on top. See [`NOTICE`](NOTICE) for the full attribution. Thanks to the Homarr project and its contributors.
