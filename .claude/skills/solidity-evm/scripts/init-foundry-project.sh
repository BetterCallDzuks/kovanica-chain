#!/usr/bin/env bash
# Quick Foundry project bootstrap with OpenZeppelin and sensible defaults.
# Usage: ./init-foundry-project.sh <project-name>

set -euo pipefail

NAME="${1:-}"

if [[ -z "$NAME" ]]; then
  echo "Usage: $0 <project-name>"
  exit 1
fi

if [[ -d "$NAME" ]]; then
  echo "Directory $NAME already exists"
  exit 1
fi

forge init "$NAME"
cd "$NAME"

forge install OpenZeppelin/openzeppelin-contracts --no-commit

# Basic foundry.toml tweaks could be applied here if desired
echo "Project $NAME created with OpenZeppelin installed."
echo "Next: cd $NAME && forge build"
