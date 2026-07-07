#!/usr/bin/env bash
# PreToolUse hook — reads the tool call as JSON on stdin, only acts on git commit.
INPUT=$(cat)
COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // empty')

case "$COMMAND" in
  *"git commit"*) ;;
  *) exit 0 ;;
esac

PATTERN='(postgres(ql)?:\/\/[^ ]*:[^ ]*@|AKIA[0-9A-Z]{16}|-----BEGIN [A-Z ]*PRIVATE KEY-----)'
if git diff --cached | grep -E "$PATTERN" > /dev/null; then
  echo "Blocked: possible secret or connection string in staged changes." >&2
  exit 1
fi
exit 0