---
name: oracles
description: Oracle design, integration, and attack resistance for EVM protocols. Covers Chainlink, Uniswap TWAP, custom oracles, staleness, deviation, circuit breakers, and flash-loan price manipulation. Use when integrating price feeds, designing risk parameters, or reviewing oracle-dependent logic. Triggers include oracle, Chainlink, TWAP, price feed, staleness, deviation, circuit breaker, flash loan price, sequencer uptime.
---

# Oracles

## Overview

Integrate and secure price and data oracles so that protocol solvency cannot be broken by manipulation or stale data.

## Preferred Sources (2026)

- Chainlink Data Feeds (with proper validation)
- Uniswap v3 TWAP (with sufficient cardinality and observation period)
- Redstone, Pyth, API3, or other push/pull oracles where appropriate
- Sequencer uptime feeds on L2s (critical for optimistic rollups)

## Mandatory Checks on Every Read

```solidity
(, int256 answer, , uint256 updatedAt, ) = feed.latestRoundData();
if (answer <= 0) revert InvalidPrice();
if (block.timestamp - updatedAt > MAX_STALENESS) revert StalePrice();
// optional: deviation from secondary source or previous price
```

## Attack Surfaces

- Flash-loan + spot price in the same transaction
- Thin liquidity TWAP that can be pushed
- Frozen or deprecated feeds
- L2 sequencer downtime (use uptime feed + grace period)
- Rounding / precision loss between oracle decimals and token decimals

## Design Recommendations

1. Never use a single spot AMM price for solvency-critical decisions.
2. Prefer multi-oracle or TWAP + hard-coded bounds / circuit breakers.
3. On L2s, always check sequencer uptime and apply a grace period after downtime.
4. Document the exact economic assumptions (max price move per block, etc.).
5. Consider fallback oracles and emergency pause paths.

## Testing

- Fork tests that manipulate prices (via storage or mock feeds)
- Simulate sequencer downtime
- Fuzz price updates within and outside expected bounds

## Code Examples

See \`references/code-examples.md\` for concrete Solidity / Foundry snippets relevant to this skill.
