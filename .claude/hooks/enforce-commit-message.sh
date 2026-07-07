#!/usr/bin/env bash
# PreToolUse hook — checks the -m message on a git commit against
# conventional-commit format before the commit is allowed to run.
INPUT=$(cat)
COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // empty')

case "$COMMAND" in
  *"git commit"*) ;;
  *) exit 0 ;;
esac

MSG=$(echo "$COMMAND" | grep -oP '(?<=-m ")[^"]+')
PATTERN='^(feat|fix|docs|test|refactor|chore|perf|ci)(\([a-z0-9_-]+\))?: .{5,}'

if [[ -n "$MSG" ]] && ! echo "$MSG" | grep -qP "$PATTERN"; then
  echo "Blocked: commit message '$MSG' doesn't match conventional-commit format (e.g. 'feat: add idempotent order creation')." >&2
  exit 1
fi
exit 0