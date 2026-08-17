# ops/health — kovanica-chain operator health check

A small, dependency-light CLI that answers one operational question fast:
**is my kovanica-chain devnet node stack live and keeping up?**

It checks:

- **L1 latest block number** (`L1_RPC_URL`)
- **L2 latest block number** (`L2_RPC_URL`)
- **op-node sync status** (`ROLLUP_NODE_RPC_URL`, optional) via the op-node
  RPC method `optimism_syncStatus` — reports the **unsafe / safe / finalized
  L2 heads**, the **current L1** the node has processed, and the
  **unsafe -> safe head lag**.
- **rollup config summary** — if `devnet/out/rollup.json` exists, prints the
  L1/L2 chain ids and the batch inbox address from it.

The process **exits non-zero** when:

- a required RPC is unreachable (`L1_RPC_URL` / `L2_RPC_URL`, or
  `ROLLUP_NODE_RPC_URL` when set), or
- the unsafe -> safe head lag exceeds `HEAD_LAG_THRESHOLD` (default `50`).

This makes it safe to drop into a cron job, a Kurtosis post-start check, or a
CI smoke step: a non-zero exit means "operator attention needed".

> Category: **operational tooling** — read-only. It runs no consensus code and
> is not sequencer- or verifier-path. It only *observes* nodes; it never
> submits transactions, batches, or output proposals.

## Environment variables

| Var                   | Required | Default | Meaning                                                        |
| --------------------- | -------- | ------- | -------------------------------------------------------------- |
| `L1_RPC_URL`          | yes      | —       | L1 execution JSON-RPC endpoint                                 |
| `L2_RPC_URL`          | yes      | —       | L2 (op-geth) JSON-RPC endpoint                                 |
| `ROLLUP_NODE_RPC_URL` | no       | —       | op-node RPC endpoint (enables `optimism_syncStatus` reporting) |
| `HEAD_LAG_THRESHOLD`  | no       | `50`    | Max tolerated unsafe -> safe head lag (blocks) before failing  |

Invalid/negative/non-integer `HEAD_LAG_THRESHOLD` values fall back to the
default rather than erroring.

## Install & unit tests

The unit tests cover only the **pure** logic (lag computation, threshold
check, `optimism_syncStatus` field extraction/formatting, rollup.json
parsing). They need no network and no devnet.

```sh
cd ops/health
npm ci            # installs viem@2.55.17 (matches the e2e suite)
npm run test:unit # runs `node --test` over health.test.mjs
```

## Running against a devnet

```sh
cd ops/health

export L1_RPC_URL="http://127.0.0.1:8545"          # Kurtosis L1 EL RPC
export L2_RPC_URL="http://127.0.0.1:9545"           # op-geth RPC
export ROLLUP_NODE_RPC_URL="http://127.0.0.1:7545"  # op-node RPC (optional)
export HEAD_LAG_THRESHOLD=50                          # optional

npm start            # == node health.mjs
# or:
node health.mjs
```

Resolve the actual host ports from your Kurtosis enclave, e.g.:

```sh
kurtosis enclave inspect kovanica-devnet
```

### Example output (healthy)

```
kovanica-chain health check
===========================
L1 latest block : 812  (http://127.0.0.1:8545)
L2 latest block : 4310 (http://127.0.0.1:9545)

op-node sync status (http://127.0.0.1:7545):
  unsafe    L2 head : 4310
  safe      L2 head : 4302
  finalized L2 head : 4280
  current   L1      : 812
  unsafe->safe lag  : 8 block(s)
  lag within threshold (50)

rollup config (/home/user/kovanica-chain/devnet/out/rollup.json):
  L1 chain id        : 900
  L2 chain id        : 2900
  batch inbox address: 0xff00000000000000000000000000000000000900

HEALTHY: all checks passed.
```

### Exit codes

| Code | Meaning                                                             |
| ---- | ------------------------------------------------------------------ |
| `0`  | All checks passed                                                  |
| `1`  | Unhealthy: an RPC was unreachable and/or head lag exceeded limit   |
| `2`  | Misconfiguration: a required env var (`L1_RPC_URL`/`L2_RPC_URL`) is unset |

## Notes on RPC semantics

- `optimism_syncStatus` is the op-node sync RPC. Its result is an
  `eth.SyncStatus` object with snake_case block refs: `unsafe_l2`, `safe_l2`,
  `finalized_l2`, `current_l1` (and others), each carrying a `number` field.
  The extractor reads `number` from each ref and tolerates hex or decimal
  encodings and missing refs (reported as `unavailable`).
- L1/L2 latest block numbers use viem's `getBlockNumber` (`eth_blockNumber`).
- If `optimism_syncStatus` is not available on the endpoint, the op-node
  section fails with an actionable message and marks the run unhealthy — it
  does not crash the whole CLI before the other checks run.
