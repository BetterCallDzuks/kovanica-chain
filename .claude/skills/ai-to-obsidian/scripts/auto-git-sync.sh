#!/bin/bash
# Auto Git sync for Obsidian vault (run via cron every 10 min)
VAULT="${1:-.}"
cd "$VAULT" || exit 1
if ! git diff --quiet || ! git diff --cached --quiet; then
  git add -A
  git commit -m "auto: $(date '+%Y-%m-%d %H:%M')"
  git push
fi
