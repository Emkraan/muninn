# Muninn

A self-hosted dashboard and app launcher for your homelab: a live-widget tile
board over 50+ service integrations, with **strict per-user access control**
(nothing is shared by default), **multi-provider OIDC** sign-in, and a
**documented REST API**.

Muninn is a fork of [Homarr](https://github.com/homarr-labs/homarr)
(Apache-2.0) — it inherits Homarr's full dashboard: boards, drag-and-drop grid
layout, 54 widgets, 53 integrations, spotlight search, Docker/Kubernetes tools,
and backup/restore. On top of that foundation Muninn adds the Emkraan
first-party standard.

## What Muninn adds on top of Homarr

- **Cobalt UI** — the Emkraan dark, logo-blue design system with a live animated
  background.
- **Strict per-user RBAC** — boards, apps, and integrations are private to their
  owner by default; an admin selectively grants access to specific users or
  groups. (Upstream Homarr shows every app to every logged-in user.)
- **Multi-provider OIDC** — add and manage multiple identity providers from an
  admin UI (Microsoft/Entra, Google, GitHub, Okta, Keycloak, Authentik, generic
  OIDC), with provider profile-picture pull.
- **Documented REST API + console** — a served OpenAPI spec, an in-app API
  reference, scoped API keys, and an MCP endpoint.

## Status

In active development. Not yet the public release. The homelab deployment is
driven by the private `Emkraan/hq-muninn` stack repo, which pins a released
image tag from `ghcr.io/emkraan/muninn`.

## Built on Homarr

Muninn is based on Homarr v1.71.0 and remains under the **Apache License 2.0**.
See [`LICENSE`](./LICENSE) and [`NOTICE`](./NOTICE) for attribution. Thanks to
the Homarr project and its contributors.
