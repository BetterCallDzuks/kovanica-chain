#!/usr/bin/env python3
"""Validate devnet/network_params.yaml for the invariants that make the
kovanica-chain fault-proof devnet actually exercise the permissionless system.

Run: python scripts/validate_network_params.py [path]
Exits non-zero (with a clear message) on any violation. Used by CI and locally.
"""
import sys
import pathlib

try:
    import yaml
except ImportError:
    sys.exit("PyYAML is required: pip install pyyaml")

DEFAULT = "devnet/network_params.yaml"


def fail(msg: str) -> None:
    print(f"FAIL: {msg}")
    sys.exit(1)


def main() -> None:
    path = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else DEFAULT)
    if not path.exists():
        fail(f"{path} not found")

    doc = yaml.safe_load(path.read_text())
    op = doc.get("optimism_package") or fail("missing optimism_package")

    chains = op.get("chains") or fail("missing optimism_package.chains")
    if "kovanica" not in chains:
        fail("expected a 'kovanica' chain under optimism_package.chains")
    chain = chains["kovanica"]

    proposer = chain.get("proposer_params") or fail("missing kovanica.proposer_params")
    # Permissionless CANNON FaultDisputeGame — the package DEFAULTS to 1
    # (permissioned), which never finalizes real withdrawals.
    if proposer.get("game_type") != 0:
        fail("proposer_params.game_type must be 0 (permissionless CANNON), "
             f"got {proposer.get('game_type')!r}")
    # The package README spells this field 'proposal_internal' (verbatim typo).
    if "proposal_internal" not in proposer:
        fail("proposer_params.proposal_internal missing (note: spelled "
             "'proposal_internal' verbatim in the optimism-package README)")

    challengers = op.get("challengers") or fail("missing top-level optimism_package.challengers")
    if not any((c or {}).get("enabled") for c in challengers.values()):
        fail("at least one challenger must have enabled: true, or withdrawals never finalize")

    dep = op.get("op_contract_deployer_params") or fail("missing op_contract_deployer_params")
    overrides = dep.get("global_deploy_overrides") or fail("missing global_deploy_overrides")
    prestate = overrides.get("faultGameAbsolutePrestate")
    if not (isinstance(prestate, str) and prestate.startswith("0x") and len(prestate) == 66):
        fail("faultGameAbsolutePrestate must be a 32-byte 0x-hex string "
             f"(got {prestate!r})")

    # op-deployer and the op-contracts tag must move together.
    l1 = dep.get("l1_artifacts_locator")
    l2 = dep.get("l2_artifacts_locator")
    if l1 != l2:
        fail(f"l1/l2 artifacts locators should match ({l1!r} vs {l2!r})")

    print(f"OK: {path} — game_type=0, challenger enabled, prestate set, "
          f"artifacts locator {l1}")


if __name__ == "__main__":
    main()
