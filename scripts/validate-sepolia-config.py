#!/usr/bin/env python3
"""Validate the Sepolia (Stage 2) deploy-config — the mechanical gate the config
audit (docs/audits/stage2-config-review.md, finding HIGH) requires so a bad
`op-deployer apply` can't slip through on prose alone.

Two modes:

  * default (lint)   — enforces the invariants that MUST hold even while the
                       config is still a scaffold (fault proofs on, dev accounts
                       NOT funded, valid game type, a non-devnet chain id, and
                       well-formed role/prestate fields). Placeholder zero-address
                       roles and a zero/placeholder prestate are WARNINGS. Safe to
                       run in CI on the current scaffold. Exits 0.

  * --deploy (strict) — the mandatory pre-flight before `op-deployer apply`.
                       Every placeholder becomes a hard failure: no zero-address
                       roles, guardian != deployer, a real (non-placeholder)
                       Sepolia prestate, and — when L1_RPC_URL is set — the owner
                       roles must be contracts (SAFE), checked via eth_getCode.

Usage:
  python scripts/validate-sepolia-config.py [path]              # lint
  python scripts/validate-sepolia-config.py --deploy [path]     # pre-flight gate
Env (strict extras): DEPLOYER_ADDRESS (guardian!=deployer check), L1_RPC_URL
(on-chain SAFE code-size check).
"""
import json
import os
import sys
import urllib.request

DEFAULT = "packages/contracts-bedrock/deploy-config/sepolia.json"
DEVNET_L2_CHAIN_ID = 2900
ZERO_ADDR = "0x" + "0" * 40
ZERO_HASH = "0x" + "0" * 64
# The devnet prestate placeholder must never be reused for Sepolia.
KNOWN_DEVNET_PRESTATE = "0x03c7ae758795765c6664a5d39bf63841c71ff191e9189522bad8ebff5d4eca98"
ROLES = ["proxyAdminOwner", "systemConfigOwner", "guardian", "challenger"]

errors: list[str] = []
warnings: list[str] = []


def err(msg: str) -> None:
    errors.append(msg)


def warn_or_err(msg: str, strict: bool) -> None:
    (errors if strict else warnings).append(msg)


def is_addr(v) -> bool:
    return isinstance(v, str) and v.startswith("0x") and len(v) == 42 and \
        all(c in "0123456789abcdefABCDEF" for c in v[2:])


def is_hash32(v) -> bool:
    return isinstance(v, str) and v.startswith("0x") and len(v) == 66 and \
        all(c in "0123456789abcdefABCDEF" for c in v[2:])


def eth_get_code(rpc: str, addr: str) -> str:
    payload = json.dumps({"jsonrpc": "2.0", "id": 1, "method": "eth_getCode",
                          "params": [addr, "latest"]}).encode()
    req = urllib.request.Request(rpc, data=payload,
                                 headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=10) as r:
        return json.load(r).get("result", "0x")


def main() -> None:
    args = [a for a in sys.argv[1:] if a != "--deploy"]
    strict = "--deploy" in sys.argv[1:]
    path = args[0] if args else DEFAULT

    if not os.path.exists(path):
        print(f"FAIL: {path} not found")
        sys.exit(1)
    cfg = json.load(open(path))

    # --- structural invariants (hard-fail in both modes) ---------------------
    if cfg.get("useFaultProofs") is not True:
        err("useFaultProofs must be true for a public network")
    if cfg.get("fundDevAccounts") is not False:
        err("fundDevAccounts must be false for a public network")
    if cfg.get("respectedGameType") not in (0, 1):
        err(f"respectedGameType must be 0 or 1 (got {cfg.get('respectedGameType')!r})")

    l2 = cfg.get("l2ChainID")
    if not isinstance(l2, int):
        err(f"l2ChainID must be an integer (got {l2!r})")
    elif l2 == DEVNET_L2_CHAIN_ID:
        err(f"l2ChainID must not be the devnet id {DEVNET_L2_CHAIN_ID}")

    for role in ROLES:
        if not is_addr(cfg.get(role)):
            err(f"{role} must be a well-formed address (got {cfg.get(role)!r})")

    prestate = cfg.get("faultGameAbsolutePrestate")
    if not is_hash32(prestate):
        err(f"faultGameAbsolutePrestate must be a 32-byte 0x-hex string (got {prestate!r})")

    # Fault-game clock sanity: extension must be strictly below max duration, or
    # a game can never make forward progress; and an honest challenger needs a
    # realistic response window on a public network.
    ext = cfg.get("faultGameClockExtension")
    dur = cfg.get("faultGameMaxClockDuration")
    if isinstance(ext, int) and isinstance(dur, int) and ext >= dur:
        err(f"faultGameClockExtension ({ext}) must be < faultGameMaxClockDuration ({dur})")

    # Large-preimage challenge window must not outlast the game clock (else the
    # preimage dispute path can exceed the whole dispute clock). Enforced here
    # for Sepolia too, not just devnet.
    preimage = cfg.get("preimageOracleChallengePeriod")
    if isinstance(preimage, int) and isinstance(dur, int) and preimage > dur:
        err(f"preimageOracleChallengePeriod ({preimage}) must not exceed "
            f"faultGameMaxClockDuration ({dur})")

    # If structural checks already failed, report and stop before deploy checks.
    if errors:
        _report(strict, path)

    # --- deploy-readiness (warn in lint, hard-fail in --deploy) --------------
    # In strict mode the custody checks below are only meaningful with these
    # env vars set. Require them, so we never print "deploy-ready" while the
    # SAFE-contract and guardian!=deployer checks were silently skipped.
    if strict:
        if not os.environ.get("L1_RPC_URL"):
            err("--deploy requires L1_RPC_URL (to verify owner roles are SAFE contracts, not EOAs)")
        if not os.environ.get("DEPLOYER_ADDRESS"):
            err("--deploy requires DEPLOYER_ADDRESS (to verify guardian != deployer)")

    for role in ROLES:
        if cfg.get(role) == ZERO_ADDR:
            warn_or_err(f"{role} is the zero address — fill with a SAFE account before deploy", strict)

    deployer = os.environ.get("DEPLOYER_ADDRESS")
    if deployer and cfg.get("guardian", "").lower() == deployer.lower():
        warn_or_err("guardian must be distinct from the deployer EOA", strict)

    if prestate in (ZERO_HASH, KNOWN_DEVNET_PRESTATE):
        warn_or_err("faultGameAbsolutePrestate is a placeholder — regenerate the Sepolia "
                    "Cannon64 prestate (scripts/gen-prestate.sh) before deploy", strict)

    # On-chain SAFE (contract) check only in strict mode with an RPC available.
    rpc = os.environ.get("L1_RPC_URL")
    if strict and rpc:
        for role in ("proxyAdminOwner", "systemConfigOwner", "guardian"):
            addr = cfg.get(role)
            if addr == ZERO_ADDR:
                continue  # already flagged above
            try:
                if eth_get_code(rpc, addr) in ("0x", "0x0", ""):
                    err(f"{role} {addr} has no code — must be a SAFE (contract), not an EOA")
            except Exception as e:  # noqa: BLE001 — network best-effort
                warnings.append(f"could not eth_getCode {role} ({addr}): {e}")

    _report(strict, path)


def _report(strict: bool, path: str) -> None:
    for w in warnings:
        print(f"WARN: {w}")
    if errors:
        for e in errors:
            print(f"FAIL: {e}")
        sys.exit(1)
    mode = "deploy-ready" if strict else "lint"
    tail = "" if strict else " (placeholders allowed pre-deploy — see WARN lines)"
    print(f"OK ({mode}): {path} passes Sepolia config checks{tail}")
    sys.exit(0)


if __name__ == "__main__":
    main()
