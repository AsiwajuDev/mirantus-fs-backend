#!/usr/bin/env bash
# PostToolUse hook — after an Edit/Write, run only the tests related to
# the file that changed, so feedback is fast enough to actually get used.
INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')

[[ "$FILE_PATH" == *"/candidate/service/src/"* ]] || exit 0

SERVICE_DIR="$(git rev-parse --show-toplevel)/candidate/service"
cd "$SERVICE_DIR"
npx vitest related "$FILE_PATH" --run 2>&1 | tail -n 40