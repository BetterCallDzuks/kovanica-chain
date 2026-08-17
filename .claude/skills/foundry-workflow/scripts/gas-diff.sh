#!/usr/bin/env bash
# Simple gas snapshot diff helper for Foundry projects.
# Usage: ./gas-diff.sh [baseline-snapshot]
# If no baseline given, compares against .gas-snapshot if present.

set -euo pipefail

BASELINE="${1:-.gas-snapshot}"
CURRENT=".gas-snapshot.new"

if [[ ! -f "$BASELINE" ]]; then
  echo "No baseline snapshot found at $BASELINE"
  echo "Run: forge snapshot --snap $BASELINE"
  exit 1
fi

echo "Creating current snapshot..."
forge snapshot --snap "$CURRENT" --force

echo ""
echo "=== Gas Diff (baseline → current) ==="
forge snapshot --diff "$BASELINE" --snap "$CURRENT" || true

echo ""
echo "Tip: To update baseline: mv $CURRENT $BASELINE"
