#!/usr/bin/env bash
set -e
SERVICE_DIR="$(git rev-parse --show-toplevel)/candidate/service"
[ -d "$SERVICE_DIR" ] || exit 0
cd "$SERVICE_DIR"
npx eslint --quiet src 2>&1 | tail -n 30
npx tsc --noEmit 2>&1 | tail -n 30