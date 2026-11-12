# Origin CI

Cursor Origin runs this repository's CI through the Depot app. Depot executes the GitHub Actions-syntax file `.depot/workflows/ci.yml` on `depot-ubuntu-24.04` once the repository is detached from GitHub.

The checked commands are the app's own scripts, with a frozen Bun install:

```bash
bun install --frozen-lockfile
bun run lint
bun run test
bun run build
node --test scripts/ai-review.test.mjs
```

`bun run test` is `ng test --watch=false`. The Angular unit-test builder uses Vitest in jsdom when no browser is configured, so the run is headless and exits after one pass. Bun is pinned to `1.4.4`, the version that installed `bun.lock` cleanly with `--frozen-lockfile`. The review script runs on Node 22.

## Workflow map

This repository has no `.github/workflows` directory and no GitHub Actions workflows to convert. Nothing GitHub-only is dropped, and no Actions secrets exist to copy. The Depot workflow below is the CI.

| Former GitHub Actions workflow | Depot job | Commands |
| --- | --- | --- |
| None. No lint, test, build, deploy, or Firebase Hosting workflow is checked in. | `verify` on pull requests and pushes to `main` | `bun install --frozen-lockfile`, `bun run lint`, `bun run test`, `bun run build`, `node --test scripts/ai-review.test.mjs` |
| None. | `ai-review` on pull requests only | `node scripts/ai-review.mjs` |

Firebase client config is already committed in `firebase-applet-config.json`. There is no Hosting workflow and no deploy job to recreate.

## AI review

`scripts/ai-review.mjs` sends the pull request diff to Grok (`grok-4.5`) when `XAI_API_KEY` is set. It posts or updates one comment with:

```bash
origin pr comment "$PR_NUMBER" --body-file "$FILE" --edit-last --create-if-none
```

`PR_NUMBER` comes from `github.event.pull_request.number`. The base ref comes from `github.base_ref`.

When `XAI_API_KEY` is unset, the script prints `AI review skipped: XAI_API_KEY is not set` and exits 0. When the `origin` CLI is missing, or the comment command fails, it prints the review to the log and exits 0. A failed xAI response exits 1.

## Secrets to enter in Depot

| Secret | Job | Required |
| --- | --- | --- |
| `XAI_API_KEY` | `ai-review` | Optional. Reviews start when this is set. The job stays green without it. |

These application runtime values are not CI secrets. The Depot jobs do not read them:

| Name | Where it is used |
| --- | --- |
| `GEMINI_API_KEY` | Server-side Gemini voice adapter. Missing or placeholder values fall back to the fake adapter. Unit tests use the fake adapters. |
| `APP_URL` | Hosted applet URL injected outside CI. |
| Firebase web config (`apiKey`, `projectId`, and the other fields in `firebase-applet-config.json`) | Already committed client configuration. |

## GitHub-only pieces

None. There is no `.github/workflows` tree, no `GITHUB_TOKEN` publish step, and no workflow that depends on GitHub Actions services such as `actions/cache` from a previous pipeline, GitHub-hosted deploy environments, or GitHub Packages. `.github/workflows` stays absent so a billing-locked Actions run is not added back.

Depot still accepts GitHub Actions step syntax (`actions/checkout@v4`, `oven-sh/setup-bun@v2`, `actions/setup-node@v4`) inside `.depot/workflows/ci.yml`. Those actions run on the Depot runner. They are not GitHub Actions workflows.
