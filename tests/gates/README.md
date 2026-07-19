# Muninn ship-gate tests

Self-contained, zero-dependency integration tests that exercise a **live**
Muninn instance over its REST API (`/api/v1`, Bearer-token auth). These are
**deploy-time** gates - run them against a running instance before shipping, not
as CI unit tests. They use only Node built-ins (global `fetch`), so **Node 18+**
is required (developed against Node 22).

## What each gate proves

| Gate | File | Proves |
|---|---|---|
| 1 | `gate1-isolation.mjs` | Per-user isolation: two users with identically named private boards/collections never see each other's ids; a user cannot read another user's board (`GET /boards/:id` -> 401/404). |
| 2 | `gate2-api-reorg.mjs` | A full board reorg (rename every section, move every item to a different section + reorder via the **single** bulk `PATCH /boards/:id/items/positions` call, add a new section) works API-only. Direct regression test against the Homarr drag-drop failure. |
| 3 | `gate3-widgets.mjs` | All six built-in widget types are present with a config schema; `POST /widgets/preview` returns a well-formed status; a live widget item's `widget-status` returns a fresh, advancing `fetchedAt` on each poll; the type advertises a positive `defaultRefreshIntervalSeconds`. |
| 4 | `gate4-auth-admin.mjs` | The #984 fix: an admin can `POST /api/v1/users` (HTTP 201) even with `NEXT_PUBLIC_DISABLE_REGISTRATION=true`, while an unauthenticated signup is rejected with `"Registration is disabled."` |

> **Gate 5 (migration dry-run)** is not in this repo - it lives in the private
> stack repo, where the Linkwarden -> Muninn schema migration can be dry-run
> against a restored production snapshot.

## Getting API tokens

Each token is a Muninn **Access Token**:

1. Sign in to Muninn as the relevant user.
2. Go to **Settings -> Access Tokens**.
3. Create a token, copy it, and export it as the matching env var below.

You need three distinct users:

- **USER_A** and **USER_B** - two ordinary, unprivileged users (Gate 1 needs
  them to be different people so isolation is meaningful).
- **ADMIN** - a server admin (the id/email listed in `NEXT_PUBLIC_ADMIN`). Its
  token is what Gate 4 uses to provision a user while registration is disabled.

## Environment variables

| Var | Required by | Default | Notes |
|---|---|---|---|
| `MUNINN_URL` | all | `http://localhost:3000` | Base URL of the live instance (no trailing slash needed). |
| `USER_A_TOKEN` | gates 1, 2, 3 | - | Access token for user A. |
| `USER_B_TOKEN` | gate 1 | - | Access token for user B (a *different* user). |
| `ADMIN_TOKEN` | gate 4 | - | Access token for a server admin. |
| `WIDGET_TYPE` | gate 3 (optional) | `ping` | Built-in widget type to preview/poll. |
| `WIDGET_CONFIG` | gate 3 (optional) | `{"url": "<MUNINN_URL>/api/v1/health"}` | JSON string. The default points the `ping` widget at the instance's own health endpoint - a self-contained live target. |

Gate 4 assumes the instance runs with `NEXT_PUBLIC_DISABLE_REGISTRATION=true`
(the state the #984 fix is about). If registration is *not* disabled, the
unauthenticated-rejection check will fail by design.

## Running

```sh
export MUNINN_URL="https://muninn.example.com"
export USER_A_TOKEN="..."
export USER_B_TOKEN="..."
export ADMIN_TOKEN="..."

# whole suite (exits non-zero if any gate fails):
node tests/gates/run-all.mjs

# or a single gate:
node tests/gates/gate1-isolation.mjs
node tests/gates/gate2-api-reorg.mjs
node tests/gates/gate3-widgets.mjs
node tests/gates/gate4-auth-admin.mjs
```

Each gate creates its own throwaway resources and cleans them up at the end.
Set `NO_COLOR=1` to disable ANSI color in the output.

## Manual steps

### Gate 4 - manual Entra SSO step

Gate 4 automatically covers admin-side provisioning and the anonymous-signup
rejection. The **other** half - that Entra/Azure AD **SSO login still works**
while password self-registration is disabled - is verified manually:

1. Open the Muninn login page in a private/incognito window.
2. Confirm the password "Register" path is absent/disabled (registration off).
3. Click **Sign in with Entra / SSO** and complete the Microsoft login.
4. Confirm you land in the app authenticated (SSO provisions/links the account
   even though public password registration is disabled).

### Gate 4 - leftover user

Gate 4 makes a best-effort admin `DELETE /api/v1/users/:id` cleanup of the
throwaway user it creates. If that delete does not succeed, the gate logs a
`LEFTOVER user id=...` line - remove that user manually if needed.
