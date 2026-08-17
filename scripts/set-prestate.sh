#!/usr/bin/env bash
# Wire a generated Cannon64 absolute prestate hash into the devnet config and
# the contracts deploy-config, so the two never drift. Run after gen-prestate.sh.
#
#   scripts/set-prestate.sh 0x<64-hex>
set -euo pipefail

HASH="${1:-}"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
YAML="$REPO_ROOT/devnet/network_params.yaml"
JSON="$REPO_ROOT/packages/contracts-bedrock/deploy-config/devnet.json"
PRESTATE_DIR="$REPO_ROOT/devnet/static_files/prestates"

die() { echo "error: $*" >&2; exit 1; }

[[ "$HASH" =~ ^0x[0-9a-fA-F]{64}$ ]] || die "usage: set-prestate.sh 0x<64-hex-chars>"

# Sanity: warn if no matching prestate artifact is present for the challenger.
shopt -s nullglob
prestate_files=("$PRESTATE_DIR"/*.bin.gz)
if [ ${#prestate_files[@]} -eq 0 ]; then
  echo ">> WARNING: no prestate *.bin.gz found in $PRESTATE_DIR — the challenger" >&2
  echo ">> must be served the prestate file matching this hash, or it can't play." >&2
fi

# Targeted, comment-preserving in-place edits (no YAML/JSON round-trip).
perl -0pi -e "s/(faultGameAbsolutePrestate:\s*)\"0x[0-9a-fA-F]{64}\"/\${1}\"$HASH\"/" "$YAML"
perl -0pi -e "s/(\"faultGameAbsolutePrestate\":\s*)\"0x[0-9a-fA-F]{64}\"/\${1}\"$HASH\"/" "$JSON"

echo ">> set faultGameAbsolutePrestate = $HASH"
echo "   - $YAML"
echo "   - $JSON"
echo ">> Verify:  python3 scripts/validate_network_params.py"
echo ">> Reminder: re-run the devnet so contracts redeploy with the new prestate."
