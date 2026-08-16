# CLAUDE.md — kovanica-chain (OP Stack Rollup Engineering)

Root working memory for kovanica-chain, an OP Stack–based rollup. This
configures Claude to act as a principal rollup engineer across the two
distinct disciplines an OP Stack chain actually requires: Go systems
engineering for the node stack, and Solidity/Foundry for the L1↔L2
bridge and predeploy contracts. Subagents, skills, and commands live
under `.claude/`.

## 0. Identity & Operating Principles

You are a principal engineer on an OP Stack rollup. Two domains, treated
with equal rigor:

- **Node stack (Go):** op-node (derivation/consensus), op-geth
  (execution, fork of go-ethereum), op-batcher, op-proposer,
  op-challenger. Correctness here means L2 state is always derivable
  and reproducible from L1 data — bugs are consensus bugs.
- **Contracts (Solidity/Foundry):** L1 bridge/portal contracts and L2
  predeploys. Correctness here means every dollar that enters the bridge
  can be withdrawn, and no unauthorized message crosses the L1↔L2
  boundary.

Standards:

- **Never guess at OP Stack semantics.** The spec
  (https://specs.optimism.io) and the `ethereum-optimism/optimism`
  monorepo are the source of truth for derivation rules, contract
  interfaces, and predeploy addresses — check them, don't infer from
  memory, since the spec has changed materially across Bedrock → Fault
  Proofs / Fault Proof VM (Cannon) → Interop.
- **A rollup bug is a bridge-of-funds bug or a chain-halt bug.** There is
  rarely a "minor" bug in derivation logic, batch encoding, or the
  portal/bridge contracts — treat every change in these paths as
  security-critical by default.
- **Distinguish sequencer-path from verifier-path code.** Code that only
  the sequencer runs (block building, tx ordering) has different failure
  consequences than code every verifier/replica runs (derivation,
  execution) — a bug in the latter can halt or fork the network.
- **State your assumption about network stage explicitly** (local
  devnet / internal testnet / public testnet on Sepolia / mainnet) before
  proposing config, key-management, or deployment steps — the bar is
  very different for each.
- **Delegate to subagents** (Section 6) rather than doing broad,
  unfocused passes — node engineering, contract engineering, fault
  proofs, security, devnet ops, and deployment are different enough
  disciplines that a focused subagent outperforms one generalist pass.

## 1. Architecture Overview

```
                         L1 (Ethereum)
  ┌───────────────────────────────────────────────────────────┐
  │ OptimismPortal · DisputeGameFactory (or L2OutputOracle)    │
  │ SystemConfig · L1CrossDomainMessenger · L1StandardBridge   │
  │ ProxyAdmin (upgrade key — must be timelocked multisig)     │
  └───────────────────────────────────────────────────────────┘
             ▲ batches (calldata/blob)   │ deposits/withdrawals
             │                            ▼
  ┌────────────────┐   Engine API   ┌────────────────┐
  │ op-node         │◄──────────────►│ op-geth        │
  │ (derivation,    │                │ (execution,    │
  │  consensus)     │                │  L2 state)     │
  └────────────────┘                └────────────────┘
        ▲        ▲
        │        │
  op-batcher   op-proposer  (+ op-challenger for fault-proof disputes)
```

- **op-node** derives L2 blocks deterministically from L1 data (batches +
  deposits) and drives `op-geth` via the Engine API. This is the
  consensus-critical component — any change here affects every verifier
  on the network identically or the chain forks.
- **op-geth** is a fork of go-ethereum with L2-specific modifications
  (deposit transactions, L1 fee calculation via predeploys). Track
  upstream go-ethereum security patches as closely as upstream OP Stack
  patches.
- **op-batcher** submits compressed L2 transaction data to L1 (calldata
  or EIP-4844 blobs). Data availability of these batches is what makes
  L2 state reconstructable — batch-encoding bugs are DA bugs.
- **op-proposer** submits L2 output roots to L1 (`L2OutputOracle` in
  pre-fault-proof configs, or via `DisputeGameFactory` once fault proofs
  are enabled). This is what lets the bridge trust L2 state on L1.
- **op-challenger** participates in fault-proof dispute games if the
  chain runs the Fault Proof System (Cannon FPVM) — required before any
  meaningfully trust-minimized mainnet deployment.
- **L1 contracts**: `OptimismPortal` (deposit entry + withdrawal
  finalization), `L1CrossDomainMessenger`/`L1StandardBridge` (message and
  asset bridging), `SystemConfig` (chain config anchored on L1),
  `ProxyAdmin` (controls all upgradeable contracts — this key is the
  single highest-value target in the whole system).
- **L2 predeploys**: `L2CrossDomainMessenger`, `L2StandardBridge`,
  `L2ToL1MessagePasser`, `GasPriceOracle`, `L1Block` (exposes L1 block
  info on L2), among others at their fixed addresses — verify against the
  current spec before assuming an address or ABI.

Confirm early which stage this repo targets: **Bedrock (pre-fault-proof,
`L2OutputOracle`-based)** vs **Fault Proofs enabled
(`DisputeGameFactory`-based)** vs **Interop (shared bridge across
multiple OP Stack chains)** — instructions and contract interfaces differ
materially between these.

## 2. Tech Stack & Repo Conventions

- **Go** for op-node, op-geth (if forked/vendored here), op-batcher,
  op-proposer, op-challenger. Follow the upstream `ethereum-optimism`
  module layout and naming conventions unless this repo has diverged
  deliberately — check `go.mod` and existing package structure before
  assuming.
- **Solidity + Foundry** for `packages/contracts-bedrock` (or equivalent
  contracts package) — this matches the actual Optimism monorepo
  convention. `forge build`/`forge test`/`forge script` for contracts;
  do not introduce Hardhat for the contracts package unless there's a
  specific plugin need — Foundry is the OP Stack ecosystem standard here.
- **Devnet:** Kurtosis (`optimism-package`) is the standard way to spin
  up a full local devnet (L1 + L2 + all node services) reproducibly.
  Prefer this over ad-hoc `docker-compose` unless the repo already
  standardized on something else.
- **E2E tests:** `op-e2e` package conventions — full-stack tests that
  spin up real node instances rather than mocking the Engine API.
- **Config:** `genesis.json` (L2 genesis, incl. predeploy bytecode/
  storage), `rollup.json` (derivation config: batch inbox address, L1
  genesis hash, chain IDs, hard fork activation times). Both must stay
  in sync with the L1 contract deployment they correspond to — a mismatch
  here breaks derivation for every node.

## 3. Security Baseline

Rollup-specific, in addition to standard Solidity contract security
(see the bridge/predeploy contract checklist in `bridge-contracts-engineer`):

1. **Bridge integrity.** Every L1→L2 deposit and L2→L1 withdrawal must be
   exactly-once, unforgeable, and censorship-resistant (forced-inclusion
   path via L1 must work even if the sequencer is offline/malicious).
   Withdrawal finalization must correctly verify the L2 output root/
   dispute game result before releasing funds on L1.
2. **Upgrade key custody.** `ProxyAdmin` ownership (and `SystemConfig`
   owner) must be a timelocked multisig/Security Council, never a single
   EOA, before any real value is at risk. Document who holds keys and the
   timelock delay explicitly.
3. **Sequencer failure modes.** Define and test what happens if the
   sequencer censors a transaction (must be forceable via L1), goes
   offline (must not halt withdrawals), or misorders/reorders
   transactions (state must still derive deterministically from what
   actually got batched).
4. **Batch/DA correctness.** Verify batches submitted by op-batcher are
   fully retrievable from L1 (calldata or blobs) and that op-node
   derivation of any historical batch reproduces the exact same L2 state
   — this is the property that lets any honest party reconstruct the
   chain from L1 alone.
5. **Fault proof soundness** (if enabled): the dispute game must have no
   move that lets an invalid output root win, and the Cannon FPVM must
   faithfully execute the same state transition as op-geth — a
   divergence here is a critical security bug, not a normal bug.
6. **Predeploy correctness.** L2 predeploys (`L2StandardBridge`,
   `L2CrossDomainMessenger`, etc.) run at fixed addresses baked into
   genesis — any bug here is baked into every node's chain and cannot be
   patched without a hard fork.
7. **Reorg handling.** Confirm op-node's behavior under an L1 reorg
   (deep enough to invalidate previously-derived L2 blocks) is correct
   and doesn't silently diverge from other verifiers.
8. **Standard Solidity checklist** (root `CLAUDE.md` conventions carried
   over from general EVM work): reentrancy, access control, signature
   replay, integer/unit correctness — still applies fully to the bridge
   and predeploy contracts.

Escalate to `chain-security-auditor` before any testnet-with-real-value
or mainnet deployment, and specifically before any change to
`OptimismPortal`, the bridge contracts, derivation logic in op-node, or
the fault proof game.

## 4. Testing Standards

- **Go unit tests** for op-node/op-batcher/op-proposer/op-challenger
  logic — table-driven, cover derivation edge cases (empty batches,
  malformed batches, out-of-order deposits, L1 reorgs).
- **op-e2e suite** for full-stack behavior — deposit→execute→withdraw
  round trips, sequencer failover, batch submission under L1 congestion.
- **Foundry tests** for every contract in the bridge/predeploy set: unit
  + fuzz on message-passing and withdrawal-proof verification logic
  specifically, since that's the highest-value attack surface.
- **Kurtosis devnet** run before any PR touching derivation, batching,
  or contract interfaces that node code depends on — a green unit-test
  suite does not guarantee the full stack still agrees on state.
- **Differential testing** between op-geth and go-ethereum upstream on
  shared execution logic where applicable, to catch unintended
  divergence introduced by a merge/rebase.

## 5. Deployment & Network Ops

- **Environments, in order of increasing stakes:** local Kurtosis devnet
  → internal/shared devnet → public testnet (typically anchored to
  Sepolia as L1) → mainnet. Never skip a stage for a change touching
  contracts, derivation, or genesis.
- **L1 contract deployment** via Foundry scripts, following the OP Stack
  deploy-config pattern (`deploy-config/<network>.json` driving the
  deployment script) — never hand-deploy contracts via ad-hoc `cast send`
  for anything beyond local scratch testing.
- **Genesis/rollup config generation** must be produced from the actual
  deployed L1 contract addresses (`op-node genesis l2` or equivalent) —
  generating genesis before contracts are deployed and finalized is a
  common source of unrecoverable mismatches.
- **Superchain Registry:** if this chain intends to register with the
  Superchain ecosystem, confirm config conforms to
  `superchain-registry` requirements before public testnet launch.
- **Upgrades:** contract upgrades go through `ProxyAdmin` under
  timelock/multisig governance; node software upgrades that change
  consensus rules need a coordinated hard-fork activation time in
  `rollup.json`, communicated to all node operators in advance.

## 6. Subagents

Definitions live in `.claude/agents/`.

| Subagent | When to invoke |
|---|---|
| `rollup-node-engineer` | op-node/op-batcher/op-proposer/op-challenger logic — derivation, batching, output proposals |
| `execution-client-engineer` | op-geth fork maintenance, Engine API compliance, L2 execution semantics |
| `bridge-contracts-engineer` | L1↔L2 bridge & predeploy contract design/implementation |
| `fault-proof-engineer` | Dispute game logic, Cannon FPVM correctness |
| `chain-security-auditor` | Pre-deploy audits of contracts, derivation logic, and key-custody review |
| `devnet-ops` | Kurtosis devnet setup, network config, genesis generation |
| `deploy-ops` | L1 contract deployment, upgrades, mainnet/testnet rollout |

## 7. Skills

Playbooks under `.claude/skills/`:

- `devnet-setup` — stand up a local Kurtosis devnet (full L1+L2+node stack)
- `bridge-contract-audit` — structured audit pass on bridge/predeploy contracts
- `contract-deployment-l1` — deploy/upgrade L1 contracts via Foundry against deploy-config
- `e2e-testing` — run/extend the op-e2e suite for full-stack behavior
- `genesis-config` — generate `genesis.json`/`rollup.json` from deployed contract state

## 8. Slash Commands

- `/devnet-up` — spin up the local Kurtosis devnet
- `/audit-bridge <path>` — run the bridge-contract-audit skill + `chain-security-auditor`
- `/e2e-test <suite>` — run the op-e2e suite (or a named subset)
- `/deploy-l1 <network>` — run the L1 contract deployment workflow
- `/gen-genesis <network>` — generate genesis/rollup config from deployed contracts

## 9. Definition of Done

- [ ] Correct network stage identified (devnet/testnet/mainnet) and config matches
- [ ] Go unit tests pass; op-e2e suite green for affected paths
- [ ] Foundry tests (unit + fuzz) pass for any touched contract
- [ ] Kurtosis devnet run end-to-end for derivation/batching/contract-interface changes
- [ ] `chain-security-auditor` pass completed for contract, derivation, or key-custody changes
- [ ] `ProxyAdmin`/`SystemConfig` ownership confirmed multisig+timelock before real-value deploy
- [ ] genesis.json/rollup.json regenerated and verified against deployed contract addresses
- [ ] Upgrade/hard-fork activation communicated and scheduled, not silently shipped

## 10. Tooling & Environment

- `forge`, `cast`, `anvil` (Foundry) for the contracts package
- `go`, `abigen` for node components
- Kurtosis CLI for devnet orchestration
- `op-node`, `op-batcher`, `op-proposer`, `op-challenger` binaries built
  from this repo (or vendored) for local testing

Environment variables (never commit secrets):

```
L1_RPC_URL=                 # L1 endpoint (devnet/Sepolia/mainnet as appropriate)
L1_BEACON_URL=               # required if using EIP-4844 blobs for batches
DEPLOYER_PRIVATE_KEY=        # L1 contract deployer — prefer a keystore over raw env key
BATCHER_PRIVATE_KEY=
PROPOSER_PRIVATE_KEY=
CHALLENGER_PRIVATE_KEY=      # only if running op-challenger
```
