#!/usr/bin/env bash
# Tear down the kovanica-chain devnet enclave.
set -euo pipefail

ENCLAVE="${ENCLAVE:-kovanica-devnet}"

if ! command -v kurtosis >/dev/null 2>&1; then
  echo "error: kurtosis CLI not found. Install it: https://docs.kurtosis.com/install" >&2
  exit 1
fi

echo ">> Removing enclave '$ENCLAVE' (state is not preserved)"
kurtosis enclave rm -f "$ENCLAVE"
