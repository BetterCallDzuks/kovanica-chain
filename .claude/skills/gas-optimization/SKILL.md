---
name: gas-optimization
description: EVM gas optimization techniques for Solidity contracts. Use when reducing gas costs, writing gas reports, packing storage, optimizing loops, choosing between memory and calldata, using custom errors, assembly, or measuring gas with Foundry. Triggers include gas, optimize gas, gas report, storage packing, SSTORE, SLOAD, calldata, custom error, via-ir, optimizer runs.
---

# Gas Optimization

## Overview

Apply measured, production-proven gas optimizations while preserving readability and security.

## Core Rules

1. Measure first with Foundry gas reports / snapshots. Do not optimize blind.
2. Prefer clarity for cold paths; aggressively optimize hot paths (transfers, swaps, mint/burn).
3. Storage is expensive — pack variables, cache reads, use immutable/constant.
4. Custom errors save significant gas vs require strings.
5. Calldata > memory for external function inputs when possible.
6. Avoid unnecessary SLOADs inside loops.

## High-Impact Techniques

### Storage Packing
Pack multiple variables into single 32-byte slots.
```solidity
// Bad: 3 slots
uint128 a;
uint256 b;
uint128 c;

// Good: 2 slots
uint128 a;
uint128 c;
uint256 b;
```

### Cache Storage Reads
```solidity
uint256 bal = balances[user]; // one SLOAD
// use bal multiple times
```

### Custom Errors
```solidity
error InsufficientBalance();
// instead of require(bal >= amount, "insufficient");
```

### Calldata vs Memory
External functions should take calldata for arrays/strings when not modified.

### Immutable / Constant
```solidity
address public immutable ROUTER;
uint256 public constant BPS = 10_000;
```

### Unchecked Math
Only where overflow is proven impossible:
```solidity
unchecked { ++i; }
```

### Short-Circuit and Early Returns
Order conditions by likelihood and cost.

### Assembly (use sparingly)
Only for proven hot paths where Solidity cannot express the optimal code. Document thoroughly.

## Measurement Workflow

```bash
forge test --gas-report
forge snapshot
forge snapshot --diff
```

Target specific functions with --match-test and compare before/after.

## When Not to Optimize

- Readability of rarely-called admin functions
- Code that is already dominated by external call costs
- Premature micro-optimizations before architecture is solid

## Code Examples

See `references/code-examples.md` for storage packing, caching, custom errors, calldata, and immutable patterns.
