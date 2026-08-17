---
name: l2-multichain
description: L2 and multichain development guidance for EVM chains including OP Stack, Arbitrum, Base, zkSync, Polygon, and cross-chain messaging. Use when deploying to L2s, handling chain-specific quirks, bridges, CREATE2 consistency, gas pricing differences, or writing multichain scripts. Triggers include L2, Arbitrum, Optimism, Base, zkSync, Polygon, OP Stack, bridge, cross-chain, multichain, sequencer, blob.
---

# L2 Multichain

## Overview

Handle the real differences between Ethereum L1 and major L2s so contracts and scripts behave correctly across chains.

## Key Differences to Remember

### Block Numbers and Timestamps
- On OP Stack (Optimism, Base) and Arbitrum, `block.number` is not the L1 block number.
- Prefer `block.timestamp` for time-based logic; document assumptions.
- Sequencer can introduce short reorg risk or delayed finality.

### Gas and Fees
- L2 execution is cheap; L1 data availability (calldata or blobs) often dominates cost.
- EIP-4844 blobs reduced L2 fees significantly — prefer blob-friendly designs when relevant.
- Estimate gas carefully on each target chain.

### Precompiles and Opcodes
- Some L2s have custom precompiles (ArbSys on Arbitrum, L1Block on OP Stack).
- CREATE2 address calculation is generally consistent but verify on zkSync and other non-standard VMs.

### Bridges and Messaging
- Native bridges have delay windows (challenge period on optimistic rollups).
- For production cross-chain, prefer established messaging layers (LayerZero, Chainlink CCIP, Hyperlane, etc.) and understand their trust models.
- Never assume instantaneous finality for cross-chain actions.

## Multichain Deployment Practices

- Use CREATE2 with the same salt and init code for deterministic addresses across chains.
- Keep a single source of truth for addresses (config or address registry).
- Write Foundry scripts that accept chain id / RPC as parameters.
- Test on forks of each major target chain.

## Common Pitfalls

- Assuming `block.number` increases at the same rate as L1
- Hardcoding L1 addresses on L2
- Ignoring sequencer downtime or forced inclusion mechanisms
- Treating L2 ETH as having the same security properties as L1 ETH without caveats

## Code Examples

See \`references/code-examples.md\` for concrete Solidity / Foundry snippets relevant to this skill.
