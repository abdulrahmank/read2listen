# chatify-by-f1 — context for Claude

Open-source, multi-tenant document chat. Admins upload documents (name, version,
date, use) into their tenant's directory; users chat with those documents. The
reasoning layer is pluggable — the default backend shells out to Codex exec
(`codex exec`) with `cwd` set to the tenant's directory. Open-core: this repo is
the OSS core; the paid cloud edition attaches billing/quotas at the documented
seams, never by forking logic.

## Monorepo layout (npm workspaces)

- `apps/server` — Express + MongoDB + Codex exec. Serves the built SPA in production.
- `apps/web` — Vue 3 SPA (Vite, Composition API, composables — no store library).

## Multi-tenancy model

- Every tenant owns `DATA_DIR/tenants/<tenantId>/` containing its uploaded
  documents plus a generated `AGENTS.md` describing each file (name, version,
  date, use). `codex exec` always runs with that directory as `cwd`.
- `src/tenantDir.js` is the ONLY module allowed to build tenant filesystem
  paths — it sanitizes filenames and guards against traversal. Never join
  paths to tenant storage anywhere else.
- Every MongoDB query is tenant-scoped: repos take `tenantId` as their first
  argument. No route may read across tenants.
- Auth: `X-API-Key` → sha256 → tenant + role (`admin` | `member`). Keys are
  stored hashed. Admin gates document management; members can chat.
- First boot with an empty tenants collection creates a "default" tenant.
  Keys come from `DEFAULT_ADMIN_KEY`/`DEFAULT_MEMBER_KEY` env, or are
  generated and printed to the log ONCE.

## Chat pipeline (deliberately no LangGraph, no approval flow)

resolve tenant → load chat history from MongoDB (empty array if new) → write
history to `.chats/<chatId>.json` in the tenant dir → build "You are a chat
assistant…" prompt (history file path + last few turns inline + this chat's
document list; a chat with no documents attached grounds on the tenant's
whole library) → `codex exec` in the tenant dir → append user+assistant
messages → persist → respond. The prompt stays small on long chats: the agent
reads the history file only when earlier context matters. Chat is read-only
Q&A over documents; there is nothing to approve.

## Seams the cloud edition attaches to (keep them intact)

- `services/quotas.js` — no-op in OSS; cloud enforces plan limits here.
- `CodexExecutor` is injected into `ChatService` — swap the reasoning backend
  by passing a different executor; don't hardcode `new CodexExecutor()` deeper
  in the call graph.
- `tenant.plan` field exists but is unused in OSS.

## Auth model — server-wide Codex login

`scripts/docker-entrypoint.sh` runs `codex login --with-api-key` once at
container start using `OPENAI_API_KEY` (required; entrypoint exits non-zero
without it). The base image is `node:20-slim` (Debian) — NOT alpine — because
the Codex CLI ships a glibc-linked Rust binary that doesn't run on musl.

## Tests

Server only, Jest in ESM mode (`NODE_OPTIONS='--experimental-vm-modules'`).
Tests never touch MongoDB or spawn codex: repos are faked in-memory
(`tests/fakes/`), the executor is a stub, and `DATA_DIR` points at a temp dir.
Run: `npm test` (root, proxies to the server workspace).

## Things to avoid

- **No API-key fallbacks in source.** Env-only, fail loud (`env.js`).
- **No per-request OpenAI keys.** Codex login is server-wide at entrypoint.
- **No cross-tenant paths or queries.** Everything goes through `tenantDir.js`
  and tenant-scoped repos.
- **No billing code in the OSS core.** Cloud concerns attach at the seams above.
- **No new top-level docs** (other than this CLAUDE.md and the README).
  Architecture details go in inline comments where the code lives.
- Uploads may not be named `AGENTS.md` — that file is generated, and
  regenerating it must never clobber a user document.
