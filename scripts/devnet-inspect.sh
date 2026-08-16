#!/usr/bin/env bash
# Inspect the kovanica-chain devnet enclave and (optionally) download the
# op-deployer artifacts (state.json, addresses, genesis/rollup).
set -euo pipefail

ENCLAVE="${ENCLAVE:-kovanica-devnet}"
OUT_DIR="${OUT_DIR:-./devnet/out}"

if ! command -v kurtosis >/dev/null 2>&1; then
  echo "error: kurtosis CLI not found. Install it: https://docs.kurtosis.com/install" >&2
  exit 1
fi

kurtosis enclave inspect "$ENCLAVE"

echo
echo ">> Downloading op-deployer-configs to $OUT_DIR"
mkdir -p "$OUT_DIR"
kurtosis files download "$ENCLAVE" op-deployer-configs "$OUT_DIR" || \
  echo ">> (op-deployer-configs not available yet — devnet may still be starting)"
