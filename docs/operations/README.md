# kovanica-chain — operations runbooks

Operational procedures for running kovanica-chain safely. These focus on the
**trust-minimization guarantees** an OP Stack rollup must actually deliver, not
just the happy path.

| Runbook | Covers |
|---|---|
| [`forced-inclusion.md`](forced-inclusion.md) | Censorship resistance — forcing an L2 transaction via L1 when the sequencer won't include it |
| [`sequencer-failure.md`](sequencer-failure.md) | What happens (and what still works) when the sequencer is offline, censoring, or reordering |
| [`guardian-pause.md`](guardian-pause.md) | The guardian's emergency powers: pause, dispute-game blacklist, respected-game-type |

> These describe protocol-level guarantees. Exact contract entrypoints and
> function signatures depend on the deployed `op-contracts` version — always
> verify against the deployed ABIs / the spec (https://specs.optimism.io)
> before running a command against a real network (CLAUDE.md §0).

Related: fault-proof monitoring lives in [`../monitoring/`](../monitoring/);
the security posture and config audits live in [`../audits/`](../audits/).
