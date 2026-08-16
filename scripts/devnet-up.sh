#!/usr/bin/env bash
# Bring up the kovanica-chain local Kurtosis devnet (Stage 1: fault-proof
# local devnet). See devnet/README.md.
set -euo pipefail

ENCLAVE="${ENCLAVE:-kovanica-devnet}"
ARGS_FILE="${ARGS_FILE:-./devnet/network_params.yaml}"
PACKAGE="${PACKAGE:-github.com/ethpandaops/optimism-package}"

if ! command -v kurtosis >/dev/null 2>&1; then
  echo "error: kurtosis CLI not found. Install it: https://docs.kurtosis.com/install" >&2
  exit 1
fi

echo ">> Running $PACKAGE into enclave '$ENCLAVE' (args: $ARGS_FILE)"
kurtosis run "$PACKAGE" --args-file "$ARGS_FILE" --enclave "$ENCLAVE"

echo
echo ">> Devnet up. Inspect with: scripts/devnet-inspect.sh"
echo ">> Follow the challenger: kurtosis service logs $ENCLAVE op-challenger-kovanica-challenger -f"
