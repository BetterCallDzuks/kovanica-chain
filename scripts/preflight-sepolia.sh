#!/usr/bin/env bash
# Consolidated pre-flight gate to run immediately before `op-deployer apply` to
# Sepolia. Chains every deploy-blocking check; exits non-zero unless ALL pass.
# This is a manual release gate (it intentionally FAILS while the config still
# carries placeholders), not a CI step.
#
# Required env: L1_RPC_URL, DEPLOYER_ADDRESS (so the SAFE-contract and
# guardian!=deployer custody checks actually run).
#
#   L1_RPC_URL=... DEPLOYER_ADDRESS=0x... scripts/preflight-sepolia.sh
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT" || exit 1
fail=0

step() { echo; echo "== $1 =="; }

step "1/3  version pins (versions.json vs network_params)"
python3 scripts/check-versions.py || fail=1

step "2/3  Sepolia deploy-config (strict custody + fault-proof gate)"
python3 scripts/validate-sepolia-config.py --deploy || fail=1

step "3/3  L2 genesis structure (if already generated)"
python3 scripts/check-l2-genesis.py \
  devnet/out/genesis.json \
  packages/contracts-bedrock/deploy-config/sepolia.json || fail=1

echo
if [ "$fail" -ne 0 ]; then
  echo "PREFLIGHT: NOT deploy-ready — resolve the failures above before op-deployer apply." >&2
  exit 1
fi
echo "PREFLIGHT: all gates passed — safe to run 'op-deployer apply'."
