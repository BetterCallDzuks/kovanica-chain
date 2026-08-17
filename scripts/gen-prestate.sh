#!/usr/bin/env bash
# Stage 1b — generate kovanica-chain's Cannon64 absolute prestate.
#
# The absolute prestate is a cryptographic commitment to the op-program client
# binary loaded into the Cannon FPVM *for this chain's exact genesis/rollup
# config*. It CANNOT be faked or reused from another chain: if the on-chain
# `faultGameAbsolutePrestate` != the file the challenger serves, the challenger
# refuses to play and withdrawals never finalize. So this script builds it
# reproducibly from a pinned monorepo ref and your real chain configs.
#
# Runs on any host with Docker (the build itself is containerized/reproducible).
# You need kovanica's genesis + rollup first — produce them from the devnet:
#     make devnet-up && make devnet-inspect      # writes devnet/out/
# then point GENESIS/ROLLUP at the downloaded files.
#
# Reference: https://docs.optimism.io/operators/chain-operators/tutorials/absolute-prestate
set -euo pipefail

# --- inputs (override via env) ------------------------------------------------
# Pin this to the op-program/monorepo ref that MATCHES your contracts tag
# (op-contracts/v4.0.0). Do not guess — pick the governance-matched tag. See the
# tutorial + release notes. Left empty on purpose so the run fails loudly.
MONOREPO_REF="${MONOREPO_REF:-}"
L2_CHAIN_ID="${L2_CHAIN_ID:-2900}"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
GENESIS="${GENESIS:-$REPO_ROOT/devnet/out/genesis.json}"
ROLLUP="${ROLLUP:-$REPO_ROOT/devnet/out/rollup.json}"
WORKDIR="${WORKDIR:-$REPO_ROOT/.prestate-build}"
OUT_DIR="${OUT_DIR:-$REPO_ROOT/devnet/static_files/prestates}"
MONOREPO_URL="${MONOREPO_URL:-https://github.com/ethereum-optimism/optimism}"

die() { echo "error: $*" >&2; exit 1; }

command -v docker >/dev/null 2>&1 || die "docker is required"
command -v git >/dev/null 2>&1 || die "git is required"
[ -n "$MONOREPO_REF" ] || die "set MONOREPO_REF to the op-program tag matching op-contracts/v4.0.0 (e.g. MONOREPO_REF=op-program/vX.Y.Z). Refusing to guess."
[ -f "$GENESIS" ] || die "genesis not found at $GENESIS (run 'make devnet-inspect' first, or set GENESIS=)"
[ -f "$ROLLUP" ]  || die "rollup not found at $ROLLUP (run 'make devnet-inspect' first, or set ROLLUP=)"

echo ">> Building Cannon64 prestate for chain $L2_CHAIN_ID from $MONOREPO_REF"

# 1) Check out the monorepo at the pinned ref.
if [ ! -d "$WORKDIR/.git" ]; then
  rm -rf "$WORKDIR"
  git clone --depth 1 --branch "$MONOREPO_REF" "$MONOREPO_URL" "$WORKDIR" \
    || die "could not clone $MONOREPO_URL at ref '$MONOREPO_REF' — verify the tag exists"
else
  git -C "$WORKDIR" fetch --depth 1 origin "$MONOREPO_REF"
  git -C "$WORKDIR" checkout FETCH_HEAD
fi

# 2) Place this chain's configs where op-program looks for them. The reproducible
#    build auto-detects files named <chainid>-genesis-l2.json / <chainid>-rollup.json.
CFG_DIR="$WORKDIR/op-program/chainconfig/configs"
mkdir -p "$CFG_DIR"
cp "$GENESIS" "$CFG_DIR/${L2_CHAIN_ID}-genesis-l2.json"
cp "$ROLLUP"  "$CFG_DIR/${L2_CHAIN_ID}-rollup.json"
echo ">> Staged configs into $CFG_DIR"

# 3) Reproducible (containerized) prestate build. Tee the output so we can read
#    back the printed hashes.
LOG="$WORKDIR/prestate-build.log"
echo ">> Running 'make reproducible-prestate' (this is heavy; first run pulls images)"
( cd "$WORKDIR" && make reproducible-prestate ) 2>&1 | tee "$LOG"

# 4) Collect artifacts + the Cannon64 (production) hash.
mkdir -p "$OUT_DIR"
BIN_DIR="$WORKDIR/op-program/bin"
shopt -s nullglob
for f in "$BIN_DIR"/prestate-mt64.bin.gz "$BIN_DIR"/prestate-mt64.json "$BIN_DIR"/prestate-proof-mt64.json; do
  [ -f "$f" ] && cp "$f" "$OUT_DIR/" && echo ">> copied $(basename "$f") -> $OUT_DIR/"
done

# The build prints a "Cannon64 Absolute prestate hash: 0x..." line.
HASH="$(grep -ioE 'cannon64[^0-9a-fx]*0x[0-9a-f]{64}' "$LOG" | grep -oE '0x[0-9a-f]{64}' | head -1 || true)"
if [ -z "$HASH" ]; then
  echo ">> WARNING: could not auto-parse the Cannon64 hash from the build log." >&2
  echo ">> Read it from the '-------- Production Prestates --------' block in $LOG" >&2
  exit 2
fi

echo
echo "==================================================================="
echo "Cannon64 absolute prestate hash: $HASH"
echo "Artifacts: $OUT_DIR/"
echo "Next: wire it in with  ->  scripts/set-prestate.sh $HASH"
echo "      then ensure a matching <hash> prestate file is served to the challenger."
echo "==================================================================="
