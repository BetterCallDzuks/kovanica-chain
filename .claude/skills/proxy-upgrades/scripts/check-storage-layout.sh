#!/usr/bin/env bash
# Storage layout helper using Foundry.
# Usage: ./check-storage-layout.sh <ContractName> [rpc-url]
# Dumps the storage layout for manual comparison across versions.

set -euo pipefail

CONTRACT="${1:-}"
RPC="${2:-}"

if [[ -z "$CONTRACT" ]]; then
  echo "Usage: $0 <ContractName> [rpc-url]"
  echo "Example: $0 MyContract"
  echo "         $0 MyContract \$MAINNET_RPC_URL   # for on-chain comparison ideas"
  exit 1
fi

echo "=== Storage layout for $CONTRACT ==="
forge inspect "$CONTRACT" storage-layout --pretty

echo ""
echo "Also useful:"
echo "  forge inspect $CONTRACT storage"
echo "  forge inspect $CONTRACT methods"
echo ""
echo "For upgrade safety, compare the layout of the old and new implementation"
echo "and ensure only appends occurred (no reordering, type changes, or removals)."
