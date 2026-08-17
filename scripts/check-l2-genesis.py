#!/usr/bin/env python3
"""Structural sanity check for the generated L2 genesis (devnet/out/genesis.json).

Runs after `make devnet-inspect` downloads the op-deployer artifacts. Skips
cleanly (exit 0) when the genesis file is absent, so it is safe in CI and
`make check` before any devnet run.

It verifies structure and cross-consistency WITHOUT asserting specific predeploy
addresses (those are defined by the op-contracts release and the spec, not by
this repo — CLAUDE.md §0). Specifically:
  * config.chainId is present and matches deploy-config l2ChainID
  * alloc is non-empty and gasLimit is present
  * the OP predeploy namespace 0x42..00xx is populated with code (predeploys
    were actually baked into genesis)

Usage:
  python scripts/check-l2-genesis.py [genesis.json] [deploy-config.json]
"""
import json
import os
import sys

DEFAULT_GENESIS = "devnet/out/genesis.json"
DEFAULT_DEPLOY_CONFIG = "packages/contracts-bedrock/deploy-config/devnet.json"
# OP Stack predeploys live in the 0x4200...00xx namespace: 0x42 + 34 zero nibbles
# + a 4-nibble index (a full 20-byte address). Built programmatically to avoid
# miscounting the zeros.
PREDEPLOY_PREFIX = "0x42" + "0" * 34
MIN_PREDEPLOYS = 12  # conservative; a real OP genesis bakes ~30


def is_predeploy(addr: str) -> bool:
    a = (addr if addr.startswith("0x") else "0x" + addr).lower()
    return len(a) == 42 and a.startswith(PREDEPLOY_PREFIX)


def fail(msg: str) -> None:
    print(f"FAIL: {msg}")
    sys.exit(1)


def main() -> None:
    args = sys.argv[1:]
    genesis_path = args[0] if len(args) > 0 else DEFAULT_GENESIS
    deploy_cfg_path = args[1] if len(args) > 1 else DEFAULT_DEPLOY_CONFIG

    if not os.path.exists(genesis_path):
        print(f"SKIP: {genesis_path} not present (run 'make devnet-inspect' first)")
        sys.exit(0)

    genesis = json.load(open(genesis_path))
    config = genesis.get("config")
    if not isinstance(config, dict):
        fail("genesis.config missing or not an object")

    chain_id = config.get("chainId")
    if not isinstance(chain_id, int):
        fail(f"genesis.config.chainId must be an integer (got {chain_id!r})")

    if os.path.exists(deploy_cfg_path):
        expected = json.load(open(deploy_cfg_path)).get("l2ChainID")
        if isinstance(expected, int) and expected != chain_id:
            fail(f"genesis.config.chainId ({chain_id}) != deploy-config l2ChainID ({expected})")

    if genesis.get("gasLimit") in (None, "", "0x0"):
        fail("genesis.gasLimit missing")

    alloc = genesis.get("alloc")
    if not isinstance(alloc, dict) or not alloc:
        fail("genesis.alloc missing or empty")

    predeploys_with_code = 0
    for addr, acct in alloc.items():
        if is_predeploy(addr):
            code = (acct or {}).get("code")
            if isinstance(code, str) and code not in ("", "0x"):
                predeploys_with_code += 1
    if predeploys_with_code < MIN_PREDEPLOYS:
        fail(f"only {predeploys_with_code} predeploys with code in the 0x42..00xx "
             f"namespace (expected >= {MIN_PREDEPLOYS}) — genesis may be malformed")

    print(f"OK: {genesis_path} — chainId={chain_id}, {len(alloc)} alloc entries, "
          f"{predeploys_with_code} predeploys with code")
    sys.exit(0)


if __name__ == "__main__":
    main()
