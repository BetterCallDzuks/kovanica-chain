#!/usr/bin/env python3
"""Enforce that devnet/network_params.yaml matches the version pins in
versions.json (the single source of truth).

Guards the procedure's #1 pitfall — op-deployer / op-contracts drift, which
breaks derivation or yields "unknown selector" deploy errors. Run in CI and
`make check`.

Usage: python scripts/check-versions.py [versions.json] [network_params.yaml]
"""
import json
import sys

try:
    import yaml
except ImportError:
    sys.exit("PyYAML is required: pip install pyyaml")

DEFAULT_VERSIONS = "versions.json"
DEFAULT_PARAMS = "devnet/network_params.yaml"


def fail(msg: str) -> None:
    print(f"FAIL: {msg}")
    sys.exit(1)


def main() -> None:
    versions_path = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_VERSIONS
    params_path = sys.argv[2] if len(sys.argv) > 2 else DEFAULT_PARAMS

    versions = json.load(open(versions_path))
    params = yaml.safe_load(open(params_path))

    dep = (params.get("optimism_package") or {}).get("op_contract_deployer_params")
    if not isinstance(dep, dict):
        fail("optimism_package.op_contract_deployer_params missing in network_params")

    checks = [
        ("op-deployer image", versions.get("op_deployer_image"), dep.get("image")),
        ("l1 artifacts locator", versions.get("op_contracts_tag"), dep.get("l1_artifacts_locator")),
        ("l2 artifacts locator", versions.get("op_contracts_tag"), dep.get("l2_artifacts_locator")),
    ]
    for label, expected, actual in checks:
        if not expected:
            fail(f"versions.json is missing the pin for {label}")
        if expected != actual:
            fail(f"{label} drift: versions.json has {expected!r}, "
                 f"network_params has {actual!r}")

    print(f"OK: network_params matches versions.json — op-deployer "
          f"{versions['op_deployer_image'].rsplit(':', 1)[-1]}, "
          f"contracts {versions['op_contracts_tag']}")
    sys.exit(0)


if __name__ == "__main__":
    main()
