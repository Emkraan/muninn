// tests/gates/gate4-auth-admin.mjs
//
// GATE 4 - Admin user provisioning with public registration disabled (#984).
//
// This instance is expected to run with NEXT_PUBLIC_DISABLE_REGISTRATION=true.
// The upstream #984 bug side-stepped the disable-registration guard only for a
// single hardcoded id, so turning off public signup also broke admin-side user
// provisioning. The Muninn fix scopes the guard to anonymous/non-admin signups
// only. This gate proves both halves of that contract over the API:
//
//   1. An authenticated ADMIN can POST /api/v1/users and it succeeds (HTTP 201)
//      EVEN THOUGH public registration is disabled.
//   2. An UNAUTHENTICATED POST /api/v1/users is rejected with the message
//      "Registration is disabled."
//
// The Entra SSO login half of this gate (that SSO sign-in still works while
// password self-registration is off) is verified MANUALLY - see the README's
// "Gate 4 - manual Entra SSO step".

import {
  apiRaw,
  reporter,
  config,
  requireEnv,
  isMain,
  printResult,
  rand,
} from "./lib.mjs";

export default async function gate4() {
  const r = reporter("Gate 4 - Admin create w/ registration disabled");
  r.banner();

  // Password only needs >= 8 chars; username must match /^[a-z0-9_-]{3,50}$/.
  const password = "GatePass-" + rand("pw");
  let createdId;
  let err;

  try {
    requireEnv(["ADMIN_TOKEN"]);
    r.info(`Target: ${config.url}`);

    // --- 1. Admin can provision a user despite disabled registration ---
    const username = rand("gateuser");
    const created = await apiRaw("POST", "/users", {
      token: config.admin,
      body: {
        name: "Gate4 Throwaway",
        username,
        // Harmless whether or not email is enabled on the instance: when email
        // is disabled the field is ignored; when enabled it's a valid address.
        email: `${username}@example.com`,
        password,
      },
    });
    r.check(
      created.status === 201,
      `ADMIN POST /users succeeds with registration disabled (got HTTP ${created.status})`
    );
    if (created.status !== 201) {
      r.info(`server said: ${JSON.stringify(created.response)}`);
    }
    if (created.response && typeof created.response === "object") {
      createdId = created.response.id;
      r.info(`created user id=${createdId} username=${username}`);
    }

    // --- 2. Unauthenticated signup is rejected ("Registration is disabled.") ---
    const anonUser = rand("gateanon");
    const anon = await apiRaw("POST", "/users", {
      // No token: this is an anonymous public signup attempt.
      body: {
        name: "Should Not Exist",
        username: anonUser,
        email: `${anonUser}@example.com`,
        password,
      },
    });
    r.check(
      !anon.ok,
      `unauthenticated POST /users is rejected (got HTTP ${anon.status})`
    );
    r.check(
      typeof anon.response === "string" &&
        anon.response.includes("Registration is disabled."),
      `rejection message is "Registration is disabled." (got ${JSON.stringify(
        anon.response
      )})`
    );
  } catch (e) {
    err = e;
    r.fail(`unexpected error: ${e.message}`);
  } finally {
    // Best-effort cleanup: admin DELETE /users/:id is available. If it fails,
    // leave the throwaway user and note it loudly rather than failing the gate.
    if (createdId != null) {
      const del = await apiRaw("DELETE", `/users/${createdId}`, {
        token: config.admin,
        body: {},
      }).catch((e) => ({ ok: false, status: 0, response: e.message }));
      if (del && del.ok) {
        r.info(`cleaned up throwaway user id=${createdId}`);
      } else {
        r.info(
          `LEFTOVER user id=${createdId} (auto-delete returned HTTP ${
            del ? del.status : "n/a"
          }) - delete manually if needed`
        );
      }
    } else {
      r.info("no user id captured; nothing to clean up");
    }
  }

  return r.result(err);
}

if (isMain(import.meta.url)) {
  const res = await gate4();
  printResult(res);
  process.exit(res.ok ? 0 : 1);
}
