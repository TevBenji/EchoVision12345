# Security Policy

## Reporting a vulnerability

Please report security issues privately through GitHub's
[private vulnerability reporting](https://github.com/TevBenji/EchoVision12345/security/advisories/new)
— the **Security** tab on this repository.

Do not open a public issue for anything exploitable.

Expect an initial response within about a week. This is a volunteer-maintained
university project, not a commercial product with an on-call rotation.

## Supported versions

Only the `main` branch is supported. There are no backported fixes.

## Scope

This is a static front-end application. There is no backend, no database, and no
user account system, which rules out most server-side vulnerability classes.

Relevant to this project:

- Camera stream handling and permission flows
- Anything that would cause captured images to leave the device unexpectedly
- Cross-site scripting via detection labels or settings input
- Dependency vulnerabilities in the published bundle

## A note on API keys

Vite inlines every `VITE_*` variable into the client bundle at build time. These
values are **public by design** — anyone who loads the page can read them.

That is not a vulnerability in this project, it is how frontend builds work. If
you need a genuinely protected credential, put a proxy server in front of it and
never place it in this bundle.

If you find a real secret committed to this repository, please report it
privately using the link above so it can be rotated.
