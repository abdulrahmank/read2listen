#!/bin/sh
set -e

# Log the Codex CLI in once at container start. After this, every
# `codex exec` the server spawns reuses the saved credential — there is
# no per-request OpenAI key.
if [ -z "$OPENAI_API_KEY" ]; then
  echo "FATAL: OPENAI_API_KEY is required (used once to log the Codex CLI in)" >&2
  exit 1
fi

printf '%s' "$OPENAI_API_KEY" | codex login --with-api-key

exec "$@"
