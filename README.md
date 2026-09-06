<p align="center">
  <img src="logo.svg" alt="chatify-by-f1" width="88" height="99" />
</p>

# read2listen

Project domain: **read2listen.com**.

**Listen to your documents, then chat with them.** Upload documents with a declared purpose, then converse with an
AI assistant that reads them — multi-tenant, self-hostable, and open source.

Admins drop documents into their tenant's library (name, version, date, and *use* — what the
assistant should consult it for). Users open chats against any subset of those documents. Every
turn runs the agent **inside the tenant's own directory**, with an auto-generated `AGENTS.md`
telling it what each file is for, and every conversation is persisted in MongoDB so chats
continue where they left off.

> **Open core.** This repository is the complete, free, self-hostable product (MIT). A hosted,
> paid cloud edition runs the same core with billing, quotas, and hard tenant sandboxing
> attached at documented seams — never as a fork.

## Google sign-in

The login page supports **Continue with Google** and retains an API-key login option.
Each Google account gets a private library with upload/manage access. Accounts are
matched by Google's stable subject ID, not email; signing in does not grant access
to the existing default/API-key library. Sharing and linking existing libraries are
not implemented.

To enable Google SSO:

1. Create a Google Cloud OAuth client of type **Web application**, configure Google
   Auth Platform branding/audience, and add test users while the app is in Testing.
2. Register the exact authorized redirect URI:
   `https://read2listen.com/api/auth/google/callback`.
3. Set these server variables (keep the secret out of frontend code and Git):
   ```dotenv
   PUBLIC_APP_URL=https://read2listen.com
   GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
   GOOGLE_CLIENT_SECRET=your-client-secret
   ```
4. Restart the server. Serve the app and `/api` through the same HTTPS origin.

For local development with Vite, use `PUBLIC_APP_URL=http://localhost:5173` and
register `http://localhost:5173/api/auth/google/callback` in the OAuth client.
Vite proxies `/api` to the backend. For the Docker app without Vite, use port 3000
instead. Use the same hostname consistently; localhost and 127.0.0.1 are different
origins. Google sign-in stays disabled until the credentials are configured.

The backend exchanges authorization codes using PKCE and verifies Google ID token
signatures, issuer, audience, expiry, verified email and nonce. One-time login state
is bound to an HttpOnly cookie. Seven-day sessions use opaque, hashed tokens stored
in MongoDB with TTL expiry; HTTPS cookies are Secure/HttpOnly/SameSite=Lax. Session
mutations require a CSRF token and a matching origin when present. Logout revokes the
server session. Google access/refresh tokens are not stored. Session cookies are
supported on the configured `PUBLIC_APP_URL` origin; API-key integrations remain
available. No default shared tenant is assigned to a Google login.

## Read aloud

The home page is the **Reader**. Upload an article or PDF in **Documents**;
after upload, it opens in the reader with its full text visible. Press
**Read aloud** to start listening. Choose another document from the reader
selector, or use **Open in reader** in the library. Document reader URLs can
be bookmarked and reopened.
Admins and members can listen, pause, resume, stop, choose a language/region
and male, female, or no voice preference, and
set playback speed (0.5×–2×). Preferences are saved on the device; the reader
selects an installed voice automatically. Locale takes priority over voice gender.
Browser voices have no standard gender metadata, so recognized voice names and
explicit provider labels are used; unmatched preferences show a fallback notice.
The reader shows the selected voice, current passage, and full text.
Switching documents or leaving the page stops playback.

Supports text PDFs and UTF-8 TXT, Markdown, CSV, TSV, JSON, and log files.
PDF reading order uses text positions to detect ordinary two-column layouts,
reading down each column and keeping spanning headings between sections.
Complex tables, sidebars, and irregular layouts may still need manual review.
Scanned PDFs require OCR first; password-protected PDFs must be unlocked.
Server-side preparation starts after upload, or on first opening an older document.
Text blocks retain stable IDs, page numbers, and PDF positions. Codex exec receives
these blocks and returns only their order through a JSON schema. The server rejects
orders that invent, duplicate, or omit IDs; original block text is never model-generated.
The result is cached in MongoDB by source SHA-256 and extraction version. Metadata
edits do not invalidate it. Source changes do. Deleting a document removes its cache.

If Codex is unavailable, its output is invalid, or the document exceeds the AI limit
(1,500 blocks / 180,000 serialized characters), the reader uses geometric/source order.
**Retry preparation** retries a fallback result; **Use original reading order** allows
browser extraction immediately while server work continues. Scanned PDFs still need OCR.
Preparation uses the existing Codex login/configuration, requires no extra voice API,
and runs with a read-only sandbox in a temporary workspace. It can add model usage.
The temporary workspace is not a substitute for OS isolation in an adversarial
multi-tenant deployment (see the security model below). Up to four jobs run per server
process; active jobs restart on demand after a server restart. Deployments with multiple
server processes may prepare the same uncached document concurrently.
`MOCK_EXECUTOR=true` uses deterministic reading order without calling Codex.
Browser PDF extraction remains available as the original-order fallback. Speech uses the browser's Web Speech API;
voice availability and network use depend on the device and selected voice.
No speech API key is required. Audio downloads and background playback are not provided.

Forked from [feature1-ai/chatify-by-f1](https://github.com/feature1-ai/chatify-by-f1),
with its MIT license and document chat features retained. The demo below shows
upstream chat features.

## Demo

<p align="center">
  <img src="assets/chatify-demo.gif" alt="chatify-by-f1 demo — upload a document, then chat with it" width="720" />
</p>

Upload a document with its declared *use*, then chat and get a grounded answer.
▶️ [Watch the full video with voiceover](assets/chatify-demo.mp4).

## How it works

```
┌─ apps/web ────────────┐        ┌─ apps/server ─────────────────────────────┐
│ Vue 3 SPA             │  HTTP  │ Express API (X-API-Key → tenant + role)   │
│ chats · documents     │ ─────► │                                           │
│ settings              │        │  MongoDB: tenants, documents, chats       │
└───────────────────────┘        │  Disk:    DATA_DIR/tenants/<tenantId>/    │
                                 │           ├── <uploaded documents…>       │
                                 │           └── AGENTS.md   (generated)     │
                                 │                                           │
                                 │  chat turn = history JSON from MongoDB    │
                                 │    + prompt → codex exec (cwd = tenant    │
                                 │    dir) → reply → history JSON to MongoDB │
                                 └───────────────────────────────────────────┘
```

- **Multi-tenancy is directory isolation.** Every tenant owns
  `DATA_DIR/tenants/<tenantId>/`; the agent (`codex exec`) always runs with that directory as
  its working directory, and every MongoDB query is tenant-scoped. API keys map to exactly one
  tenant with a role: `admin` (manage documents) or `member` (chat).
- **AGENTS.md keeps the agent oriented.** It's regenerated on every document change, listing
  each file with its name, version, date, and use — so the agent knows which files matter for
  a question without opening everything.
- **Conversation continuity is plain JSON.** Each chat's messages are stored in MongoDB and
  passed to the agent verbatim on every turn (an empty array for a new chat). Documents can be
  added to a chat at any point as the conversation grows.
- **New chats cover the whole library by default.** Every document is attached when a chat is
  created; unchecking narrows the scope. When attached documents disagree on something relevant,
  the agent surfaces the conflict — naming the documents and versions — instead of silently
  picking one.
- **The reasoning layer is pluggable.** `ChatService` takes any executor with
  `execute(prompt, { cwd })`; Codex exec is the default, injected once in
  `apps/server/src/index.js`.

## Data sources

Today a tenant's knowledge is its **uploaded documents** — files in
`DATA_DIR/tenants/<tenantId>/`, described by the generated `AGENTS.md` and read by the agent at
query time.

The same retrieval model extends to live systems. Because the reasoning layer is the Codex
agent, any source exposed as an **MCP server** can be attached per tenant: the agent calls the
MCP tool *during a turn* and answers from fresh results — no sync job, no separate index,
exactly the way it reads files today. `AGENTS.md` grows a "sources" section so the agent knows
what each connection is for and when to use it.

| Source | Status | Notes |
| --- | --- | --- |
| Uploaded files | **Available** | PDF (text), Markdown, CSV, text; read in the tenant dir |
| MCP connectors | **Roadmap** | Databases (Postgres/MySQL), warehouses (Databricks), SaaS systems — any MCP server |

MCP connections are provisioned through **[Nango](https://www.nango.dev)** (hosted): it handles
per-tenant OAuth and credential storage, so third-party secrets never live in this repo or the
tenant filesystem. The app scopes each tenant to its own connections and requests **read-only**
access (chat is Q&A — there is nothing to write). This attaches at the executor seam
(`CodexExecutor`): the agent's MCP configuration is generated per tenant, keeping the same
tenant-isolation boundary as documents. Adding live data sources widens that boundary from "read
another tenant's files" to "read another tenant's systems", so per-tenant scoping and read-only
credentials are load-bearing here — see the security model below.

## Quick start (Docker)

```bash
git clone https://github.com/abdulrahmank/read2listen.git
cd read2listen
cp .env.example .env        # set OPENAI_API_KEY
docker compose up --build
```

First boot creates a **default tenant** and prints its admin + member API keys to the log
**once** (only hashes are stored — save them). Then open http://localhost:3000, paste a key in
**Settings**, upload documents in **Documents** (admin key), and start chatting.

To pin the bootstrap keys instead, set `DEFAULT_ADMIN_KEY` / `DEFAULT_MEMBER_KEY` in `.env`
before the first boot.

## Deploy at read2listen.com

Run the Docker Compose stack on your host and put an HTTPS reverse proxy in
front of port 3000. Point the domain's DNS records at that host, provision TLS
for `read2listen.com`, and proxy requests to the app. The web app and `/api`
should share the same origin; leave the API base URL in Settings empty.
Set `CORS_ORIGIN=https://read2listen.com` in the server environment.
Repository creation does not configure DNS, hosting, or certificates.

## Local development

Requires Node.js 22.13 or newer.

```bash
npm install
npm run dev:server     # API on :3000  (needs MONGODB_URI + codex CLI logged in)
npm run dev:web        # Vite dev server on :5173, proxies /api to :3000
npm test               # server test suite (no MongoDB or codex needed)
```

The server needs a MongoDB (e.g. `docker run -p 27017:27017 mongo:7`) and the
[Codex CLI](https://www.npmjs.com/package/@openai/codex) installed and logged in
(`codex login`). Tests need neither: repos are faked in-memory and the executor is stubbed.

## API

Protected `/api` routes accept a Google session cookie or `X-API-Key`.
`/api/auth/*` provides login configuration, session inspection, OAuth callbacks,
and logout. Session mutations require `X-CSRF-Token`. Roles: **A** = admin key required.

| Method | Path | Description |
| --- | --- | --- |
| GET | `/api/auth/config` | Whether Google sign-in is enabled (no credentials exposed) |
| GET | `/api/auth/session` | Current cookie session and CSRF token; or authenticated=false |
| GET | `/api/auth/google` | Start Google sign-in |
| GET | `/api/auth/google/callback` | Validate callback and create session |
| POST | `/api/auth/logout` | Revoke current cookie session (CSRF required when signed in) |
| GET | `/health` | Liveness (no key) |
| GET | `/api/tenant` | Tenant + role for the presented key |
| GET | `/api/documents/:id/reader` | Read cached preparation or idle/preparing/error status (tenant-scoped) |
| POST | `/api/documents/:id/reader` | Start preparation; optional `{ "retry": true }` retries fallback results; returns 202 while preparing |
| GET | `/api/documents/:id/content` | Download document bytes for the authenticated tenant (admin or member); no caching |
| GET | `/api/documents` | List the tenant's documents |
| POST | `/api/documents` **A** | Upload (multipart): `file` + optional `name`/`version`/`date`/`use` (defaulted, editable later) |
| PATCH | `/api/documents/:id` **A** | Edit metadata: any of `{ name, version, date, use }` (AGENTS.md refresh) |
| DELETE | `/api/documents/:id` **A** | Delete a document (file + metadata + AGENTS.md refresh) |
| GET | `/api/chats` | List chat summaries |
| POST | `/api/chats` | Create a chat: `{ title?, documentIds? }` |
| GET | `/api/chats/:id` | Chat with full message history |
| POST | `/api/chats/:id/messages` | Send a turn: `{ content }` → `{ reply, messages }`; with `Accept: text/event-stream`, streams SSE `chunk` events then `done` |
| POST | `/api/chats/:id/documents` | Attach more documents: `{ documentIds }` |
| DELETE | `/api/chats/:id` | Delete a chat |

## Configuration

| Variable | Required | Default | Description |
| --- | --- | --- | --- |
| `OPENAI_API_KEY` | yes | — | Used once at container start: `codex login --with-api-key` |
| `MONGODB_URI` | yes | — | Connection string; server fails loud without it |
| `PORT` | no | `3000` | HTTP port |
| `DATA_DIR` | no | `./data` | Root of per-tenant document storage |
| `DEFAULT_ADMIN_KEY` | no | generated | Admin key for the default tenant (first boot only) |
| `DEFAULT_MEMBER_KEY` | no | generated | Member key for the default tenant (first boot only) |
| `MAX_UPLOAD_MB` | no | `25` | Upload size limit |
| `CODEX_TIMEOUT_MS` | no | `600000` | Kill a codex run after this long; the chat request fails cleanly instead of hanging |
| `CODEX_SANDBOX` | no | `read-only` | codex's own sandbox mode. The Docker image sets `danger-full-access`: the container is the isolation boundary, and bubblewrap can't run under Docker's default seccomp profile |
| `MOCK_EXECUTOR` | no | `false` | `true` = built-in demo replies, no OpenAI account needed |
| `INTENT_GUARD` | no | `full` | Message screening before the agent runs: `full` (heuristics + codex classifier), `heuristic` (regex only, no extra model call), `off` |
| `CORS_ORIGIN` | no | `*` | CORS origin for the API |
| `LOG_LEVEL` | no | `info` | `error` \| `warn` \| `info` \| `debug` |

## Security model, honestly stated

- API keys are stored **hashed** (SHA-256); they are shown once at creation and cannot be
  recovered.
- Uploaded filenames are sanitized and every tenant path is resolved through a single guarded
  module (`tenantDir.js`) — path traversal attempts are rejected, and `AGENTS.md` is reserved
  (an upload by that name is renamed, never allowed to impersonate the generated file).
- **Intent guard (defense in depth).** Every chat message is screened before the agent runs
  (`INTENT_GUARD`, default `full`): fast heuristics block obvious escape/injection attempts
  (path traversal, credential/env fishing, shell commands, "ignore your instructions"), and
  anything subtler gets a read-only codex classification pass that must clear the message before
  the real answer runs. Blocked messages never reach the agent and are not persisted. The chat
  prompt is also hardened to refuse reading outside its directory and to treat instructions
  embedded in documents as data.
- **Known limitation:** the guard raises the bar but is **not** a boundary. Directory isolation
  controls what the agent is *pointed at*, but `codex exec` runs as the server process — and in
  Docker, codex's own sandbox is disabled (`CODEX_SANDBOX=danger-full-access`) because the
  container is the isolation boundary. A determined, novel injection (including one embedded in
  an uploaded document, which the guard doesn't see) could still make the agent read outside its
  working directory. For self-hosting among trusted tenants this is acceptable; the real fix for
  adversarial tenants is per-tenant OS-level sandboxing — the hosted edition's answer and a
  roadmap item here. Do not host adversarial tenants on a bare install.

## Where the paid cloud edition attaches (and the OSS core stays clean)

- `apps/server/src/services/quotas.js` — no-op here; metering/billing there.
- `tenant.plan` — recorded, unused here.
- Executor injection in `index.js` — the hosted edition swaps in a sandboxed executor.

## License

[MIT](LICENSE)
