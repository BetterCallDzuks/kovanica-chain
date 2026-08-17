# ops/da-check — data-availability spot-check

op-batcher posts compressed L2 data to the L1 **batch inbox**. That data
availability is what lets any honest party reconstruct L2 state from L1 alone
(CLAUDE.md §3.4). If the batcher stalls, the L2 **safe** head falls behind and
withdrawals can't finalize against un-derived state. This CLI scans recent L1
blocks for transactions to the batch inbox and alarms on a DA stall.

This is the third leg of the safety-monitoring triad, alongside
[`../health/`](../health/) (heads / sync lag) and
[`../dispute-mon/`](../dispute-mon/) (fault-proof games).

## Usage

```bash
npm ci
L1_RPC_URL=http://<l1-rpc> node da-check.mjs
```

The batch inbox address is read from `BATCH_INBOX_ADDRESS`, else from
`devnet/out/rollup.json` (`batch_inbox_address`, produced by `make devnet-inspect`).

| Env | Default | Meaning |
|---|---|---|
| `L1_RPC_URL` | (required) | L1 execution RPC |
| `BATCH_INBOX_ADDRESS` | from rollup.json | override the inbox address |
| `DA_SCAN_BLOCKS` | 64 | how many recent L1 blocks to scan |
| `DA_STALL_BLOCKS` | 50 | alarm if this many blocks pass with no batch |

Exit codes: `0` healthy, `1` DA stall / RPC error, `2` missing required config.

## Tests

```bash
npm run test:unit   # node --test — pure logic, no network
```

## Caveats

- Devnet DA mode is **calldata**, so batches are plain transactions to the inbox
  (`to == inbox`); this tool matches on that. For **blob** DA the batcher still
  targets the inbox with blob-carrying transactions — verify the match against
  the deployed batcher's tx shape for your DA mode before relying on it.
- Scanning is O(blocks) `getBlock` calls; keep `DA_SCAN_BLOCKS` modest for a
  spot-check. For continuous production monitoring use op-dispute-mon-style
  infra and batcher metrics rather than polling.
