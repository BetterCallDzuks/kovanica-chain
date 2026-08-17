---
name: defi-patterns
description: Production DeFi design patterns for EVM including ERC-4626 vaults, lending, AMMs, staking, vesting, governance, and oracle integration. Use when building or reviewing yield vaults, money markets, DEX components, reward distributors, or any tokenized DeFi protocol. Triggers include DeFi, ERC-4626, vault, lending, AMM, Uniswap, Aave, staking, vesting, yield, oracle, liquidity, TVL.
---

# DeFi Patterns

## Overview

Implement secure, gas-efficient, and composable DeFi primitives. Prefer battle-tested patterns and OpenZeppelin / Solmate bases where appropriate.

## Core Building Blocks

### ERC-4626 Tokenized Vaults
Standard interface for yield-bearing vaults. Always implement the full interface and consider inflation attacks (virtual shares/assets or dead shares).

Key concerns:
- Share price manipulation on empty vault
- Rounding direction (favor the vault)
- Fee accounting on deposit/withdraw/mint/redeem
- Compatible with SafeERC20

### Lending / Borrowing
- Collateral factor + liquidation threshold
- Interest rate models (utilization-based)
- Oracle staleness and deviation checks
- Bad debt socialization or insurance fund
- Isolated vs cross-margin modes

### Staking & Rewards
- Reward accumulator pattern (rewardPerTokenStored + userRewardPerTokenPaid)
- Avoid loops over stakers for distribution
- Cliff + linear vesting with pull model

### Access & Emergency
- Pausable with role separation (pauser vs unpauser)
- Timelock on critical parameter changes
- Circuit breakers for oracles or extreme utilization

## Security Priorities for DeFi

1. Economic correctness under flash loans
2. Oracle robustness
3. Share/asset rounding
4. Reentrancy on callbacks (ERC-777, ERC-1155, hooks)
5. Governance attack surface if tokens have voting power

## Recommended Libraries

- OpenZeppelin Contracts (ERC20, ERC4626, AccessControl, TimelockController)
- Solmate (gas-optimized primitives when audited and appropriate)
- Chainlink (or equivalent) for price feeds with proper validation

When generating code, always include a threat model note for the economic assumptions.

## Code Examples

See \`references/code-examples.md\` for concrete Solidity / Foundry snippets relevant to this skill.
