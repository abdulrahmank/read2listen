# chatify-by-f1

**Chat with your documents.** Upload documents with a declared purpose, then converse with an
AI assistant that reads them — multi-tenant, self-hostable, and open source.

Admins drop documents into their tenant's library (name, version, date, and *use* — what the
assistant should consult it for). Users open chats against any subset of those documents. Every
turn runs the agent **inside the tenant's own directory**, with an auto-generated `AGENTS.md`
telling it what each file is for, and every conversation is persisted in MongoDB so chats
continue where they left off.

> **Open core.** This repository is the complete, free, self-hostable product (MIT). A hosted,
> paid cloud edition runs the same core with billing, quotas, and hard tenant sandboxing
> attached at documented seams — never as a fork.

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
- **The reasoning layer is pluggable.** `ChatService` takes any executor with
  `execute(prompt, { cwd })`; Codex exec is the default, injected once in
  `apps/server/src/index.js`.

## Quick start (Docker)

```bash
git clone https://github.com/feature1-ai/chatify-by-f1.git
cd chatify-by-f1
cp .env.example .env        # set OPENAI_API_KEY
docker compose up --build
```

First boot creates a **default tenant** and prints its admin + member API keys to the log
**once** (only hashes are stored — save them). Then open http://localhost:3000, paste a key in
**Settings**, upload documents in **Documents** (admin key), and start chatting.

To pin the bootstrap keys instead, set `DEFAULT_ADMIN_KEY` / `DEFAULT_MEMBER_KEY` in `.env`
before the first boot.

## Local development

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

All `/api` routes require `X-API-Key`. Roles: **A** = admin key required.

| Method | Path | Description |
| --- | --- | --- |
| GET | `/health` | Liveness (no key) |
| GET | `/api/tenant` | Tenant + role for the presented key |
| GET | `/api/documents` | List the tenant's documents |
| POST | `/api/documents` **A** | Upload (multipart): `file`, `name`, `version`, `date`, `use` |
| DELETE | `/api/documents/:id` **A** | Delete a document (file + metadata + AGENTS.md refresh) |
| GET | `/api/chats` | List chat summaries |
| POST | `/api/chats` | Create a chat: `{ title?, documentIds? }` |
| GET | `/api/chats/:id` | Chat with full message history |
| POST | `/api/chats/:id/messages` | Send a turn: `{ content }` → `{ reply, messages }` |
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
| `CODEX_TIMEOUT_MS` | no | `120000` | Kill a codex run after this long; the chat request fails cleanly instead of hanging |
| `CORS_ORIGIN` | no | `*` | CORS origin for the API |
| `LOG_LEVEL` | no | `info` | `error` \| `warn` \| `info` \| `debug` |

## Security model, honestly stated

- API keys are stored **hashed** (SHA-256); they are shown once at creation and cannot be
  recovered.
- Uploaded filenames are sanitized and every tenant path is resolved through a single guarded
  module (`tenantDir.js`) — path traversal attempts are rejected, and `AGENTS.md` is reserved
  (an upload by that name is renamed, never allowed to impersonate the generated file).
- **Known limitation:** directory isolation controls what the agent is *pointed at*, but
  `codex exec` runs as the server process. A hostile prompt could ask the agent to read outside
  its working directory. For self-hosting among trusted tenants this is usually acceptable;
  per-tenant OS-level sandboxing (containers) is the hosted edition's answer and a roadmap item
  here. Do not host adversarial tenants on a bare install.

## Where the paid cloud edition attaches (and the OSS core stays clean)

- `apps/server/src/services/quotas.js` — no-op here; metering/billing there.
- `tenant.plan` — recorded, unused here.
- Executor injection in `index.js` — the hosted edition swaps in a sandboxed executor.

## License

[MIT](LICENSE)
