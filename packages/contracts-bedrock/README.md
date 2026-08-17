# packages/contracts-bedrock

Foundry package for **kovanica-chain**'s L1↔L2 contracts work.

> **Read this before adding a contract.** The canonical OP Stack contracts
> (`OptimismPortal`, `DisputeGameFactory`, `SystemConfig`,
> `L1/L2CrossDomainMessenger`, `L1/L2StandardBridge`, and the L2 predeploys)
> are **not** hand-written here. They are deployed from the pinned,
> governance-approved contracts release **`op-contracts/v4.0.0`** via
> `op-deployer`/OPCM. Per `CLAUDE.md` §0/§3, these paths are security-critical
> and the `ethereum-optimism/optimism` monorepo at the pinned tag is the source
> of truth — never reproduce portal/bridge/predeploy semantics from memory.

## What this package is for

- **Deploy config** (`deploy-config/<network>.json`) — the human-readable intent
  for each network's chain parameters (fault-proof timers, chain IDs, ownership).
  For the local Kurtosis devnet these same values are applied through
  `op_contract_deployer_params.global_deploy_overrides` in
  `../../devnet/network_params.yaml`; for a standalone `op-deployer` deployment
  they map onto the `op-deployer` intent. Keep the two in sync.
- **Custom / extension contracts** — anything genuinely specific to kovanica
  (e.g. a custom token, a periphery helper) that is *not* a core bridge or
  predeploy. Add these under `src/` with full Foundry unit + fuzz tests.
- **Tests** against the deployed system where useful.

The `src/example/` + `test/` files are a throwaway Foundry scaffold that only
exists to prove the toolchain builds and CI runs — delete them once real
contracts land.

## Toolchain

```bash
forge install foundry-rs/forge-std   # first time: fetch the test lib (gitignored)
forge fmt --check
forge build --sizes
forge test -vvv
```

`forge`/`cast`/`anvil` come from [Foundry](https://book.getfoundry.sh/). CI runs
the same `fmt --check` / `build` / `test` steps (see
`../../.github/workflows/ci.yml`).

## Vendoring the OP Stack contracts (when needed)

If you need the real contracts locally (to fork-test against, or to build a
custom prestate), vendor them at the pinned tag rather than copying files:

```bash
forge install ethereum-optimism/optimism@op-contracts/v4.0.0
```

and add the matching remapping. Do not check the vendored tree into this
package — pin it and let it be fetched reproducibly.
