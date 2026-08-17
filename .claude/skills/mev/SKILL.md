---
name: mev
description: MEV awareness, protection, and design patterns for EVM protocols including sandwich attacks, frontrunning, backrunning, JIT liquidity, and private orderflow. Use when designing swaps, auctions, liquidations, or any user-facing value transfer that can be exploited by searchers. Triggers include MEV, sandwich, frontrun, backrun, slippage, private mempool, Flashbots, orderflow, liquidation MEV, JIT.
---

# MEV

## Overview

Design protocols and user flows that are resilient to (or intentionally harness) Maximal Extractable Value.

## Core Concepts

- **Sandwich** — attacker frontruns a victim swap then backruns, extracting value from slippage.
- **Frontrunning** — seeing a profitable tx in the mempool and inserting ahead of it.
- **Backrunning** — inserting immediately after a tx that creates an opportunity (e.g. large swap creating arb).
- **JIT liquidity** — providing liquidity only for one block around a large trade.
- **Liquidation MEV** — competing to liquidate undercollateralized positions.

## Design Mitigations

1. **Tight slippage + deadline** on all swaps and trades.
2. **Commit-reveal** or encrypted mempools for sensitive actions.
3. **Batch auctions** or frequent batching (CoW-style) to reduce sequential MEV.
4. **Private orderflow / RPCs** (Flashbots Protect, MEV Blocker, etc.) for users.
5. **Internal accounting** that does not rely on spot AMM prices in the same transaction without protection.
6. ** captcha / rate limits / intent-based systems** for high-value actions.

## When Building

- Assume a sophisticated searcher sees every public mempool transaction.
- Prefer designs where the protocol itself captures the MEV (or shares it) rather than leaking it.
- Document residual MEV surfaces clearly.
- For liquidations, consider Dutch auctions or keeper networks with fair ordering.

## User-Facing Advice

Always recommend (or enforce) slippage protection and consider private submission paths for large trades.

## Code Examples

See \`references/code-examples.md\` for concrete Solidity / Foundry snippets relevant to this skill.
