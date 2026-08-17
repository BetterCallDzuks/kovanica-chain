#!/usr/bin/env python3
"""Cross-check that kovanica-chain's config files agree with each other.

Guards the "genesis/rollup drift from deployed contracts" pitfall: a
mismatch across the chain's config files silently breaks L2 derivation for
every node. This script does NOT re-validate a single file's invariants
(see scripts/validate_network_params.py for that) — it verifies that the
Kurtosis devnet params and the Foundry deploy-config describe the SAME chain.

Checks agreement between:
  A) devnet/network_params.yaml
       optimism_package.chains.kovanica.network_params.network_id
       optimism_package.chains.kovanica.proposer_params.game_type
       optimism_package.op_contract_deployer_params.{l1_artifacts_locator,
         l2_artifacts_locator, global_deploy_overrides.{faultGameAbsolutePrestate,
         faultGameWithdrawalDelay, proofMaturityDelaySeconds,
         disputeGameFinalityDelaySeconds, faultGameMaxClockDuration,
         faultGameClockExtension}}
  B) packages/contracts-bedrock/deploy-config/devnet.json
       l2ChainID, respectedGameType, useFaultProofs,
       faultGameAbsolutePrestate, and the same timer fields.

Optionally (only if present) cross-checks:
  devnet/out/rollup.json   — l2 chain id, block time, batch inbox present
  devnet/out/genesis.json  — config.chainId matches l2ChainID

Run: python scripts/check-config-consistency.py \
        [network_params.yaml] [deploy-config.json] [rollup.json] [genesis.json]

Exits non-zero (with a clear message) on any mismatch. Used by CI and locally.
"""
import json
import pathlib
import sys

try:
    import yaml
except ImportError:
    sys.exit("PyYAML is required: pip install pyyaml")

DEFAULT_PARAMS = "devnet/network_params.yaml"
DEFAULT_DEPLOY = "packages/contracts-bedrock/deploy-config/devnet.json"
DEFAULT_ROLLUP = "devnet/out/rollup.json"
DEFAULT_GENESIS = "devnet/out/genesis.json"

# Timer fields shared between the two config surfaces. Compared only where the
# field is present in BOTH files (network_params overrides are optional).
SHARED_TIMER_FIELDS = (
    "faultGameWithdrawalDelay",
    "proofMaturityDelaySeconds",
    "disputeGameFinalityDelaySeconds",
    "faultGameMaxClockDuration",
    "faultGameClockExtension",
)


def fail(msg: str) -> None:
    print(f"FAIL: {msg}")
    sys.exit(1)


def norm_hex(value):
    """Lowercase a 0x-hex string for case-insensitive comparison."""
    if isinstance(value, str):
        return value.lower()
    return value


def main() -> None:
    args = sys.argv[1:]
    params_path = pathlib.Path(args[0] if len(args) > 0 else DEFAULT_PARAMS)
    deploy_path = pathlib.Path(args[1] if len(args) > 1 else DEFAULT_DEPLOY)
    rollup_path = pathlib.Path(args[2] if len(args) > 2 else DEFAULT_ROLLUP)
    genesis_path = pathlib.Path(args[3] if len(args) > 3 else DEFAULT_GENESIS)

    if not params_path.exists():
        fail(f"{params_path} not found")
    if not deploy_path.exists():
        fail(f"{deploy_path} not found")

    # ---- Load network_params.yaml (source A) --------------------------------
    doc = yaml.safe_load(params_path.read_text())
    if not isinstance(doc, dict):
        fail(f"{params_path} is not a YAML mapping")
    op = doc.get("optimism_package") or fail("missing optimism_package")

    chains = op.get("chains") or fail("missing optimism_package.chains")
    chain = chains.get("kovanica") or fail(
        "expected a 'kovanica' chain under optimism_package.chains")

    net = chain.get("network_params") or fail("missing kovanica.network_params")
    if "network_id" not in net:
        fail("missing kovanica.network_params.network_id")
    try:
        network_id = int(net["network_id"])
    except (TypeError, ValueError):
        fail(f"network_id is not an integer: {net['network_id']!r}")

    proposer = chain.get("proposer_params") or fail("missing kovanica.proposer_params")
    if "game_type" not in proposer:
        fail("missing kovanica.proposer_params.game_type")
    game_type = proposer["game_type"]

    dep = op.get("op_contract_deployer_params") or fail(
        "missing op_contract_deployer_params")
    l1_locator = dep.get("l1_artifacts_locator")
    l2_locator = dep.get("l2_artifacts_locator")
    if l1_locator is None:
        fail("missing op_contract_deployer_params.l1_artifacts_locator")
    if l2_locator is None:
        fail("missing op_contract_deployer_params.l2_artifacts_locator")
    overrides = dep.get("global_deploy_overrides") or fail(
        "missing op_contract_deployer_params.global_deploy_overrides")
    yaml_prestate = overrides.get("faultGameAbsolutePrestate")
    if yaml_prestate is None:
        fail("missing global_deploy_overrides.faultGameAbsolutePrestate")

    # ---- Load deploy-config/devnet.json (source B) --------------------------
    try:
        cfg = json.loads(deploy_path.read_text())
    except json.JSONDecodeError as exc:
        fail(f"{deploy_path} is not valid JSON: {exc}")
    if not isinstance(cfg, dict):
        fail(f"{deploy_path} is not a JSON object")

    for key in ("l2ChainID", "respectedGameType", "faultGameAbsolutePrestate"):
        if key not in cfg:
            fail(f"{deploy_path} missing {key}")

    # ---- Assertions: A vs B -------------------------------------------------
    l2_chain_id = cfg["l2ChainID"]
    if network_id != l2_chain_id:
        fail(f"chain id mismatch: network_params network_id={network_id} "
             f"!= deploy-config l2ChainID={l2_chain_id}")

    respected = cfg["respectedGameType"]
    if game_type != respected:
        fail(f"game type mismatch: network_params game_type={game_type!r} "
             f"!= deploy-config respectedGameType={respected!r}")

    cfg_prestate = cfg["faultGameAbsolutePrestate"]
    if norm_hex(yaml_prestate) != norm_hex(cfg_prestate):
        fail(f"faultGameAbsolutePrestate mismatch: network_params "
             f"{yaml_prestate!r} != deploy-config {cfg_prestate!r}")

    if l1_locator != l2_locator:
        fail(f"artifacts locators disagree: l1={l1_locator!r} != l2={l2_locator!r}")

    if cfg.get("useFaultProofs") is not True:
        fail("deploy-config useFaultProofs must be true "
             f"(got {cfg.get('useFaultProofs')!r})")

    matched_timers = []
    for field in SHARED_TIMER_FIELDS:
        if field in overrides and field in cfg:
            if overrides[field] != cfg[field]:
                fail(f"timer field {field} mismatch: network_params "
                     f"{overrides[field]!r} != deploy-config {cfg[field]!r}")
            matched_timers.append(field)

    # ---- Optional: rollup.json ---------------------------------------------
    rollup_note = "rollup.json absent (skipped)"
    if rollup_path.exists():
        try:
            rollup = json.loads(rollup_path.read_text())
        except json.JSONDecodeError as exc:
            fail(f"{rollup_path} is not valid JSON: {exc}")
        # rollup.json nests chain params under l2_chain_id / genesis / block_time.
        rollup_chain_id = rollup.get("l2_chain_id")
        if rollup_chain_id is None:
            cfg_block = rollup.get("genesis", {}).get("l2", {})
            rollup_chain_id = cfg_block.get("chain_id") or cfg_block.get("chainId")
        if rollup_chain_id is not None and int(rollup_chain_id) != l2_chain_id:
            fail(f"rollup.json l2 chain id {rollup_chain_id} != l2ChainID "
                 f"{l2_chain_id}")

        block_time = rollup.get("block_time")
        cfg_block_time = cfg.get("l2BlockTime")
        if (block_time is not None and cfg_block_time is not None
                and int(block_time) != int(cfg_block_time)):
            fail(f"rollup.json block_time {block_time} != deploy-config "
                 f"l2BlockTime {cfg_block_time}")

        if "batch_inbox_address" not in rollup:
            fail("rollup.json missing batch_inbox_address")
        rollup_note = (f"rollup.json OK (chain_id={rollup_chain_id}, "
                       f"batch_inbox={rollup['batch_inbox_address']})")

    # ---- Optional: genesis.json --------------------------------------------
    genesis_note = "genesis.json absent (skipped)"
    if genesis_path.exists():
        try:
            genesis = json.loads(genesis_path.read_text())
        except json.JSONDecodeError as exc:
            fail(f"{genesis_path} is not valid JSON: {exc}")
        gcfg = genesis.get("config") or fail("genesis.json missing config")
        gchain = gcfg.get("chainId")
        if gchain is None:
            fail("genesis.json missing config.chainId")
        if int(gchain) != l2_chain_id:
            fail(f"genesis.json config.chainId {gchain} != l2ChainID {l2_chain_id}")
        genesis_note = f"genesis.json OK (chainId={gchain})"

    timers_desc = ", ".join(matched_timers) if matched_timers else "none shared"
    print("OK: config consistent — "
          f"chainId={l2_chain_id}, game_type={game_type}, "
          f"prestate matches, locator {l1_locator}, "
          f"timers agree [{timers_desc}]")
    print(f"     {rollup_note}; {genesis_note}")


if __name__ == "__main__":
    main()
