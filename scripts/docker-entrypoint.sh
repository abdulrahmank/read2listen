#!/bin/sh
set -e

# Log the Codex CLI in once at container start. After this, every
# `codex exec` the server spawns reuses the saved credential — there is
# no per-request OpenAI key.
if [ "$MOCK_EXECUTOR" = "true" ]; then
  echo "MOCK_EXECUTOR=true — skipping codex login; chat replies come from the built-in demo executor."
elif [ -z "$OPENAI_API_KEY" ]; then
  echo "FATAL: OPENAI_API_KEY is required (used once to log the Codex CLI in), or set MOCK_EXECUTOR=true for the local demo backend" >&2
  exit 1
else
  printf '%s' "$OPENAI_API_KEY" | codex login --with-api-key
fi

exec "$@"
