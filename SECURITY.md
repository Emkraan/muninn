# Security Policy

## Supported versions

Muninn is developed on a rolling basis. Security fixes land on `main` and in the
most recent tagged release. Older tags do not receive backports.

| Version | Supported |
| ------- | --------- |
| latest `main` / newest `v0.x` tag | yes |
| older tags | no |

## Reporting a vulnerability

Please report suspected vulnerabilities privately. Do **not** open a public issue
for a security problem.

- Use GitHub's private vulnerability reporting: the **Security** tab of this
  repository -> **Report a vulnerability**.
- Include a description, affected version/commit, reproduction steps, and impact.

You can expect an acknowledgement within a few days. Once a fix is available it
will be released and the report credited unless you request otherwise.

## Scope

Muninn is a fork of [Linkwarden](https://github.com/linkwarden/linkwarden). A
vulnerability inherited unchanged from upstream should also be reported to the
upstream project. Issues in Muninn-specific code (the board/widget layer, the
admin/audit changes, the authentication changes) are handled here.
