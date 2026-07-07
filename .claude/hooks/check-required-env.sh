#!/usr/bin/env bash
# SessionStart hook — runs once when a Claude Code session begins, before
# any MCP servers try to launch. Surfaces missing env vars up front
# instead of letting the postgres/github MCP servers fail silently later.

MISSING=()
[ -z "$DATABASE_URL" ] && MISSING+=("DATABASE_URL")
[ -z "$GITHUB_TOKEN" ] && MISSING+=("GITHUB_TOKEN")

if [ ${#MISSING[@]} -gt 0 ]; then
  echo "⚠️  Missing env vars: ${MISSING[*]}" >&2
  echo "    The MCP servers in .mcp.json need these to start. Set them" >&2
  echo "    in this shell before launching Claude Code, e.g.:" >&2
  echo "      export DATABASE_URL=postgresql://user:pass@localhost:5432/orders" >&2
  echo "      export GITHUB_TOKEN=ghp_xxx" >&2
fi
exit 0