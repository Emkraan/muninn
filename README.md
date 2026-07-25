# Muninn

A self-hosted dashboard and app launcher for your homelab: a live-widget tile
board over 50+ service integrations, with **strict per-user access control**
(nothing is shared by default), **multi-provider OIDC** sign-in, and a
**documented REST API**.

Muninn is a fork of [Homarr](https://github.com/homarr-labs/homarr)
(Apache-2.0) — it inherits Homarr's full dashboard: boards, drag-and-drop grid
layout, 54 widgets, 53 integrations, spotlight search, Docker/Kubernetes tools,
and backup/restore. On top of that foundation Muninn adds a cohesive
first-party standard.

## What Muninn adds on top of Homarr

- **Cobalt UI** — a dark, logo-blue design system with a live animated
  background and a redesigned sign-in screen (glowing logo badge + an ambient
  3D raven mascot that flies around, reduced-motion aware) shared by the login
  and invite pages. An optional deployment-set footer credit keeps the public
  build brand-agnostic.
- **Strict per-user RBAC** — boards, apps, and integrations are private by
  default; an admin selectively grants a specific user or group access to a
  specific resource (each has its own per-user/per-group Access panel). So a
  user sees exactly the apps/boards/integrations shared with them, nothing more.
  (Upstream Homarr shows every app to every logged-in user.)
- **Multi-provider OIDC** — add and manage any number of identity providers from
  the admin UI at **Manage -> Authentication** (Microsoft/Entra, Google, GitHub,
  Okta, Keycloak, Authentik, generic OIDC, or manual OAuth2). Providers are
  stored in the database and apply on the next sign-in with no restart, each with
  its own claim and group-to-role mapping and provider profile-picture pull. This
  replaces Homarr's single env-configured OIDC provider.
- **Documented REST API + console** — a served OpenAPI spec, an in-app API
  reference, an MCP endpoint, and per-key scoped, optionally-expiring API keys
  (a key can never exceed its owner's permissions; users can self-issue keys
  scoped to their own access). Replaces Homarr's unscoped, never-expiring keys.

## Status

In active development, not yet a tagged public release. A deployment pins a
released image tag from `ghcr.io/emkraan/muninn`; environment-specific
configuration (secrets, host bindings, an optional footer credit) lives in a
separate private stack repository, so the published image stays brand-agnostic.

## Built on Homarr

Muninn is based on Homarr v1.71.0 and remains under the **Apache License 2.0**.
See [`LICENSE`](./LICENSE) and [`NOTICE`](./NOTICE) for attribution. Thanks to
the Homarr project and its contributors.
