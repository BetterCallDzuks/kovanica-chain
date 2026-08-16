# Bootstrapping a Fault-Proof OP Stack Rollup (“kovanica-chain”) and a Local Kurtosis Devnet — 2026 Procedure

## TL;DR

- **op-deployer + OPCM is now the canonical way to deploy L1 contracts** for a new standard OP Stack chain; the old `forge script Deploy.s.sol` and `op-node genesis l2` paths are legacy. The current flow is `op-deployer init` → edit `intent.toml` → `op-deployer apply` → `op-deployer inspect genesis|rollup`.  Pin `op-deployer` and the `op-contracts/vX.Y.Z` tag together — each minor op-deployer release supports exactly one governance-approved contracts release. 
- **For a local devnet, run the ethpandaops `optimism-package` under Kurtosis**, enable a top-level `challengers:` block plus per-chain `proposer_params.game_type: 0` (permissionless CANNON), and shorten dispute timers via `op_contract_deployer_params.global_deploy_overrides` so a full deposit→withdraw→prove→finalize loop takes minutes not days.
- **The single most version-sensitive item is the Cannon absolute prestate.** It must be regenerated for your chain’s genesis/rollup config and its hash placed in `faultGameAbsolutePrestate`, and the challenger must be given the matching prestate file — otherwise proposer/challenger cannot play games and withdrawals never finalize.

## Key Findings

### 1. Standard repo layout and version pins

The monorepo `ethereum-optimism/optimism` top-level directories are current and stable: `op-node`, `op-batcher`, `op-proposer`, `op-challenger`, `op-deployer`, `op-conductor`, `op-dispute-mon`, `op-program`, `cannon`, and `packages/contracts-bedrock`.   The contracts package **is still `packages/contracts-bedrock`**. `op-geth` remains a separate repo (`ethereum-optimism/op-geth`).

Version pinning rules (from official docs):

- Off-chain components use tags of the form `<component>/v<semver>` (e.g. `op-node/v1.13.4`).  Bare `v<semver>` tags are Go-only releases and **do not** contain contracts. 
- Contracts use `op-contracts/vX.Y.Z` tags. Only deploy from these.
- op-geth embeds upstream geth’s version: geth `v1.12.0` → op-geth `v1.101200.0`. 

Recent contract releases: `op-contracts/v2.0.0`, `v3.0.0`, `v4.0.0`, `v4.1.0`, `v5.0.0`  (Upgrade 17), through the `v7.0.0` “Karst” line in mid-2026. The ethpandaops optimism-package currently defaults to `op-deployer:v0.4.2` with `l1/l2_artifacts_locator: tag://op-contracts/v4.0.0`.  

**Caveats / version-sensitive milestones:**

- **Upgrade 14 (MT-Cannon):** per Optimism Docs “Upgrade 14 MT-Cannon and Isthmus L1 Contracts,” *“Beginning with this upgrade, op-program absolute prestates will now use the ‘cannon64’ variant. This upgrade includes the absolute prestate for op-program 1.5.1-rc.1, which is `0x03ee2917da962ec266b091f4b62121dc9682bb0db534633707325339f99ee405`.”* Operators must run op-challenger/v1.3.3 (preferred) or at least v1.3.1. Fault proofs now run on 64-bit multithreaded Cannon (`mipsVersion 8`).
- **Upgrade 17 (`op-contracts/v5.0.0`, Jovian/Fusaka readiness):** added a Cannon + Kona game type. Per Optimism Docs: *“Cannon + Kona: This upgrade adds a new game type to use Kona Proof with the Cannon Fault Proof VM. It does not change the respected game type.”*
- **Upgrade 19b “Karst” (`op-contracts/v7.0.0`), executed 2026-06-25** via OPContractsManagerV2 (`0x9Ce712Ff84E02659846dc6450BB9b7642fE8bE5D`, v7.1.17): per L2BEAT’s OP Mainnet page, this *“changed the respected game type 0 → 8 (CANNON → CANNON_KONA): the permissionless fault proof now runs the Rust kona-client on the Cannon VM instead of op-program. Trust model is unchanged (still permissionless fault proofs).”* On the Karst line some chains moved op-geth to end-of-support in favor of op-reth.

For a brand-new testnet chain, pick one recent governance-approved contracts tag and match op-deployer/op-node/op-geth (or op-reth) to it rather than mixing.

### 2. Deploy tooling: op-deployer/OPCM vs legacy forge scripts

**op-deployer is the standard.** It uses a declarative “intent” file and OP Contracts Manager (OPCM), a factory + shared predeployed implementations, to deploy each chain’s L1 contracts.

Workflow (official docs):

```bash
# 1. init — generates .deployer/intent.toml + state.json
op-deployer init \
  --l1-chain-id 11155111 \
  --l2-chain-ids <YOUR_L2_CHAIN_ID> \
  --workdir .deployer \
  --intent-type standard-overrides   # standard | custom | standard-overrides

# 2. apply — deploys L1 contracts (superchain+implementations if needed, then the OP chain)
op-deployer apply \
  --workdir .deployer \
  --l1-rpc-url $L1_RPC_URL \
  --private-key $PRIVATE_KEY

# 3. inspect — emit chain artifacts
op-deployer inspect genesis --workdir .deployer <YOUR_L2_CHAIN_ID> > .deployer/genesis.json
op-deployer inspect rollup  --workdir .deployer <YOUR_L2_CHAIN_ID> > .deployer/rollup.json
```

`apply` writes deployment state (including all contract addresses and roles) to `.deployer/state.json`. Intent `configType` values: `standard`, `standard-overrides` (recommended), `custom`. For custom/standalone chains you set `opcmAddress` and matching `l1ContractsLocator`/`l2ContractsLocator` tags.  On Sepolia, OPCM/contract addresses are pre-populated by `op-deployer init` for supported versions (the docs example uses `opcmAddress = "0x3bb6437aba031afbf9cb3538fa064161e2bf2d78"`, `l1ContractsLocator = "tag://op-contracts/v2.0.0"`, `l2ContractsLocator = "tag://op-contracts/v1.7.0-beta.1+l2-contracts"`).

**Difference from legacy `op-node genesis l2`:** the old path was `forge script Deploy.s.sol` to deploy contracts, then `op-node genesis l2 --deploy-config ... --l1-deployments ... --outfile.l2 genesis.json --outfile.rollup rollup.json`.  op-deployer replaces both steps: `inspect genesis`/`inspect rollup` derive the L2 genesis and rollup config directly from deployment state, keeping them consistent with the deployed contracts. Editing `genesis.json` by hand no longer works because `rollup.json` hashes won’t update to match — regenerate via inspect instead. The docs have an open task (docs issue #1262) to fully migrate all genesis/rollup instructions to op-deployer.

**Funding:** the docs recommend the deployer wallet hold a buffer of **1.5–3.5 ETH on Sepolia** depending on gas; the batcher and proposer addresses should each be funded with at least ~0.5 Sepolia test ETH. (Community reports note the deployment itself typically consumes under 1 ETH.)

### 3. Fault Proof System configuration

Enabling fault proofs is controlled through deploy-config fields (settable via the op-deployer intent’s `globalDeployOverrides`, or `global_deploy_overrides` in the Kurtosis package). Key fields (from `op-chain-ops/genesis/config.go` and the op-deployer `state`/`standard` packages):

- `useFaultProofs` (bool) — use DisputeGameFactory instead of legacy L2OutputOracle.
- `faultGameAbsolutePrestate` — Cannon prestate hash the games start from.
- `faultGameMaxDepth`, `faultGameSplitDepth`, `faultGameClockExtension`, `faultGameMaxClockDuration`.
- `faultGameGenesisBlock`, `faultGameGenesisOutputRoot`.
- `faultGameWithdrawalDelay` — seconds users wait before withdrawing ETH from a fault game.
- `preimageOracleMinProposalSize`, `preimageOracleChallengePeriod`.
- `proofMaturityDelaySeconds` — proof maturity before a withdrawal can be finalized.
- `disputeGameFinalityDelaySeconds` — extra “air-gap” delay after game resolution (enforced by the portal/AnchorStateRegistry).
- `respectedGameType` — the game type OptimismPortal respects for finalizing withdrawals. `0` = permissionless FaultDisputeGame (CANNON); `1` = PermissionedDisputeGame; `8` = CANNON_KONA (post-Karst). op-deployer’s standard constant defaults `DisputeGameType = 1` (PERMISSIONED). 

Production standard values for contrast (op-deployer `standard` constants / mainnet deploy-config): `faultGameWithdrawalDelay 604800`, `proofMaturityDelaySeconds 604800`, `disputeGameFinalityDelaySeconds 302400`, `faultGameMaxDepth 73`, `faultGameSplitDepth 30`,  `faultGameClockExtension 10800`, `faultGameMaxClockDuration 302400`,  `mipsVersion 8`.

**Cannon absolute prestate** — this is the commitment to the initial FPVM state (the op-program/kona client binary loaded into Cannon). It matters because dispute games bisect down to a single MIPS instruction starting from this prestate; if the on-chain `faultGameAbsolutePrestate` doesn’t match the prestate the op-challenger holds, the challenger refuses to play and no game can resolve. For chains in the Superchain Registry, standard prestates are published (`standard-prestates.toml`). For a **new/custom chain not in the registry, you must build a custom prestate** because the prestate encodes your chain config. Process (official “Generating absolute prestate” tutorial): place your chain’s genesis/rollup config in `op-program/chainconfig/configs`, check out the matching `op-program/vX.Y.Z` tag, build, and run the prestate generation, which outputs:

```
-------------------- Production Prestates --------------------
Cannon64  Absolute prestate hash: 0x03eb07101fbdeaf3f04d9fb76526362c1eea2824e4c6e970bdb19675b72e4fc8
```

Use the **Cannon64** (64-bit MT-Cannon) hash for production;  place it in `faultGameAbsolutePrestate` and serve the matching `<HASH>.json`/`<HASH>.bin.gz` file to the challenger. There is a deliberate circular dependency: you deploy L1 contracts first, then generate genesis/rollup, then generate the prestate from them — which is why chains bootstrap in the PermissionedDisputeGame first.

### 4. Local Kurtosis devnet with fault proofs

Run the ethpandaops package:

```bash
kurtosis run github.com/ethpandaops/optimism-package \
  --args-file ./network_params.yaml \
  --enclave op-devnet
```

The package uses op-deployer internally to deploy contracts and artifacts (typically ~5 min to come up). To enable fault proofs you add a top-level `challengers:` block, set the chain’s proposer to a permissionless game, and shorten dispute timers. Sample `network_params.yaml`:

```yaml
optimism_package:
  chains:
    kovanica:
      participants:
        node0:
          el:
            type: op-geth
          cl:
            type: op-node
      network_params:
        network_id: "2151908"
        seconds_per_slot: 2
      proposer_params:
        game_type: 0           # 0 = permissionless CANNON FaultDisputeGame (1 = PERMISSIONED default)
        proposal_internal: 10m # NOTE: field is literally spelled "proposal_internal" in the repo README
  challengers:
    kovanica-challenger:
      enabled: true
      participants: "*"        # connect to all L2 nodes
      cannon_prestates_path: "static_files/prestates"
      datadir: "/data/op-challenger/op-challenger-data"
  op_contract_deployer_params:
    image: us-docker.pkg.dev/oplabs-tools-artifacts/images/op-deployer:v0.4.2
    l1_artifacts_locator: tag://op-contracts/v4.0.0
    l2_artifacts_locator: tag://op-contracts/v4.0.0
    global_deploy_overrides:
      faultGameWithdrawalDelay: 3600
      disputeGameFinalityDelaySeconds: 3600
      proofMaturityDelaySeconds: 3600
      faultGameMaxClockDuration: 1200
      faultGameClockExtension: 0
      faultGameAbsolutePrestate: "0x03c7ae758795765c6664a5d39bf63841c71ff191e9189522bad8ebff5d4eca98"
ethereum_package:
  network_params:
    preset: minimal
    genesis_delay: 5
```

The correct override key is `global_deploy_overrides` nested under `op_contract_deployer_params` (there is no `additional_deploy_overrides` key in the current repo). The `faultGameAbsolutePrestate` value must match the prestate file the challenger serves. In the monorepo’s own kurtosis-devnet this is templated as `faultGameAbsolutePrestate: {{ localPrestate.Hashes.prestate_mt64 }}`.  

**Services that should report healthy:** the L1 (geth/reth + CL), and per L2: `op-el-1-*` (op-geth), `op-cl-1-*` (op-node), op-batcher, `op-proposer-*`, and `op-challenger-<challenger-name>` (e.g. `op-challenger-kovanica-challenger`). op-proposer and op-challenger are auto-started (a challenger for each `challengers:` entry with `enabled: true`, launched from `main.star`). Inspect and debug with:

```bash
kurtosis enclave inspect op-devnet
kurtosis service logs op-devnet op-challenger-kovanica-challenger -f
kurtosis files download op-devnet op-deployer-configs ./configs   # state.json, addresses, rollup/genesis
```

**Shortening challenge/finalization periods for devnet iteration:** set the `global_deploy_overrides` above (e.g. `faultGameWithdrawalDelay`, `disputeGameFinalityDelaySeconds`, `proofMaturityDelaySeconds` down to ~3600s or lower; `faultGameMaxClockDuration` ~1200s; `faultGameClockExtension` 0). Community devnet configs have run these as low as `faultGameWithdrawalDelay: 60`, `disputeGameFinalityDelaySeconds: 600`, `proofMaturityDelaySeconds: 120` (throwaway devnets only).

### 5. Devnet sanity check: deposit → execute → withdraw → prove → finalize

- **Deposit:** `cast send <L1StandardBridge or OptimismPortal> --value <amt> ...` or a bridge deposit; funds appear on L2 after derivation. The optimism-package pre-funds the standard `test test test ... junk` mnemonic dev accounts on L2.
- **Withdraw round-trip:** the modern path proves against a **dispute game root claim via DisputeGameFactory**, not L2OutputOracle. Viem’s op-stack actions implement this end-to-end: `initiateWithdrawal` (L2) → `waitToProve`  → `getGame` / `getWithdrawals` → `buildProveWithdrawal` → `proveWithdrawal` (which calls `proveWithdrawalTransaction` on OptimismPortal) → wait for game resolution + `proofMaturityDelaySeconds` + `disputeGameFinalityDelaySeconds` → `finalizeWithdrawal`. Viem `getGame` explicitly targets chains with a deployed `DisputeGameFactoryProxy`.
- **Tools:** viem op-stack (recommended for scripted round-trips), `cast` for raw calls, and the `op-challenger` manual subcommands for testing (`create-game`, moves, `resolveClaim`, `resolve`). Get the factory address from deployment state, e.g. `DISPUTE_GAME_FACTORY=$(jq -r .DisputeGameFactoryProxy .deployer/state.json)` (or from the addresses file produced by `kurtosis files download`).
- The op-challenger automatically resolves games once clocks expire (calls `resolveClaim` on subgames, then `resolve` on the root); after `disputeGameFinalityDelaySeconds` passes the withdrawal can be finalized. Do **not** use the legacy L2OutputOracle `l2OutputIndex`/`getL2Output` path on a fault-proof chain.

### 6. Known pitfalls (2026)

- **Genesis/rollup drift from deployed contracts:** never hand-edit `genesis.json` — `rollup.json` hashes won’t match. Always regenerate with `op-deployer inspect`. Record the op-deployer version, op-contracts tag, and commit hash alongside artifacts (you’ll need them for the Superchain Registry later).
- **Wrong absolute prestate:** if `faultGameAbsolutePrestate` ≠ the challenger’s prestate file, the challenger refuses to act and games never resolve; withdrawals then revert at finalize with *“OptimismPortal: output proposal has not been validated.”* Post–Upgrade 14, use the 64-bit MT-Cannon prestate (`prestate-mt64.bin.gz` / Cannon64 hash), not the old single-threaded `prestate.bin.gz`; post-Karst, production uses the CANNON_KONA (kona-client) prestate.
- **DA mode calldata vs blobs:** op-batcher’s default `--data-availability-type` is `calldata`; `blobs`/`auto` exist but `auto` only works well for high-throughput chains that fill multi-blob transactions every few minutes. On a local devnet, prefer `calldata` to avoid blob-availability issues.
- **Mismatched op-node/op-geth versions:** run tags from the same release line; common failures include op-node erroring on “failed to get L2 genesis blockhash” or “unknown fork” when versions or the contracts tag disagree. `unknown selector: <hex>` from op-deployer almost always means op-deployer and the contracts tag are mismatched — try the op-deployer minor version that maps to your `op-contracts` tag.
- **Ownership defaults for a testnet:** official guidance is to use a Gnosis SAFE for `proxyAdminOwner`/`guardian` roles (the owner must be a smart contract to support upgrades) and a plain EOA only as the deployer (which retains no control after deployment). Set `fundDevAccounts: false` for anything public. The guardian controls pause, dispute-game blacklist, and respected-game-type — keep it distinct from the deployer.

## Details

**Why op-deployer/OPCM replaced forge scripts:** OPCM deploys shared implementation contracts once per L1 via CREATE2 and then cheaply stamps out per-chain proxies, making deployments reproducible, version-checksummed (`tag://` locators validate against hardcoded checksums), and upgrade-friendly (`op-deployer upgrade vX.Y.Z` emits calldata for SAFE execution via DELEGATECALL from the chain-owning contract). This is why standard chains should always deploy from a governance-approved `op-contracts` tag.

**Fault-proof withdrawal semantics** (Fault Proof Mainnet / “Alpha Chad”): OptimismPortal points to DisputeGameFactory; withdrawals prove against a game’s immutable `rootClaim`; an “air-gap” (`disputeGameFinalityDelaySeconds`) sits between game resolution and finalization; the guardian can blacklist games. The maximum adversarial withdrawal delay in production is **19.5 days** — per Optimism Docs “Preparing for Fault Proofs Breaking Changes,” the standard 7-day finalization + 3.5 days if the proposal receives a validity challenge + up to 9 more days if a valid proposal is maliciously challenged (7 + 3.5 + 9 = 19.5). This is exactly why devnets and testnets shorten these timers.

**Bootstrapping order (the circular dependency):** deploy L1 contracts (permissioned game first) → generate L2 genesis + rollup config → generate the Cannon prestate from those configs → deploy/point the permissionless FaultDisputeGame at that prestate → run op-challenger with the matching prestate. The optimism-package automates most of this when you set `game_type` and a `challengers:` block.

## Recommendations

1. **Stage 1 — local devnet first (immediate goal).** Use the `network_params.yaml` above with `game_type: 0`, an `enabled` challenger, and shortened `global_deploy_overrides`. Pin `op-deployer:v0.4.2` + `op-contracts/v4.0.0` (or bump both together to a newer matched pair). Confirm all services healthy via `kurtosis enclave inspect`, then run a viem withdrawal round-trip. **Threshold to proceed:** a deposit and a full prove→finalize withdrawal both succeed in minutes.
1. **Stage 1b — verify the prestate.** Build your chain’s Cannon64 prestate from your generated genesis/rollup, confirm the printed hash equals `faultGameAbsolutePrestate`, and confirm op-challenger logs show it responding to games. If the challenger logs a missing/refused prestate, fix before moving on.
1. **Stage 2 — Sepolia testnet.** Switch to real `op-deployer apply` against a Sepolia RPC with a funded deployer (1.5–3.5 ETH; batcher/proposer ~0.5 ETH each), set SAFE-based `proxyAdminOwner`/`guardian`, `fundDevAccounts: false`, restore production-ish timers (or moderately shortened, e.g. 1-hour delays for a testnet), and register artifacts (op-deployer version, contracts tag, commit) for a future Superchain Registry entry. **Threshold to go permissionless:** op-dispute-mon shows healthy games and your challenger reliably resolves them.
1. **Version hygiene:** whenever you bump the contracts tag, re-derive genesis/rollup, regenerate the prestate, and bump op-node/op-geth (or op-reth on Karst+) to the same release line. Never mix bare `v<semver>` (Go-only) releases with `op-contracts/*` expectations. If you target the Karst (`v7.0.0`) line, plan for CANNON_KONA (respected game type 8) and op-reth rather than op-geth on affected chains.

## Caveats

- **Fast-moving surface.** Contract tags, op-deployer versions, default images in optimism-package, and the fault-proof program (op-program → kona-client on Karst) all changed through 2025–2026. Treat every version pin here as “verify against the current release page at deploy time.” The optimism-package README on `main` and `docs.optimism.io` are the live sources; L2BEAT and the monorepo releases page track upgrade timing.
- **`proposal_internal` spelling** is a genuine field name in the optimism-package README (not `proposal_interval`); use it verbatim.
- I could not open the package’s `.github/tests/` directory to quote a single dedicated fault-proofs test file verbatim; the YAML above is assembled from the canonical README schema and the OP kurtosis-devnet book (`devdocs.optimism.io/kurtosis-devnet/local_artifacts.html`), cross-checked against op-deployer’s Go config structs. The exact filename of a bundled fault-proof test example is unconfirmed.
- Some cited numeric override values (e.g. `faultGameWithdrawalDelay: 60`) come from community devnet write-ups (HackMD, OP developer discussions), not official docs — safe for throwaway devnets, not for anything public. The default `game_type` in the package is `1` (PERMISSIONED); you MUST set `0` (or `8` on Karst) to exercise the permissionless system.
- Base’s 2026 migration to a single Reth-based binary (`base/base`) and op-geth end-of-support on the Karst line signal the ecosystem is consolidating clients; for a generic OP Stack chain, op-node + op-geth/op-reth remains valid, but confirm your target contracts tag still supports op-geth before committing.