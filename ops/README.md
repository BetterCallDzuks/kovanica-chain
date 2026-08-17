# ops — operator tooling

Read-only monitoring CLIs for a running kovanica-chain devnet. Each is a small
Node/viem tool with unit-tested pure logic (run without a devnet) and a network
path that polls RPCs (needs a live devnet). None touch the sequencer or verifier
path — they only observe.

The **safety-monitoring triad** — each covers a distinct way the chain can go
wrong:

| Tool | Watches | Alarms on |
|---|---|---|
| [`health/`](health/) | L1/L2 heads, `optimism_syncStatus` | unsafe→safe head lag over threshold; RPC unreachable |
| [`dispute-mon/`](dispute-mon/) | fault-proof games (`DisputeGameFactory`) | a respected-type game resolving `CHALLENGER_WINS` (proven-invalid proposal) |
| [`da-check/`](da-check/) | batches to the L1 batch inbox | DA stall (op-batcher stopped posting retrievable data) |

For production, pair these with `op-dispute-mon` and batcher/node metrics rather
than polling — see [`../docs/monitoring/`](../docs/monitoring/).

Each tool: `cd ops/<tool> && npm ci && npm run test:unit` for the pure logic;
`node <tool>.mjs` against a devnet (env documented in each README).
