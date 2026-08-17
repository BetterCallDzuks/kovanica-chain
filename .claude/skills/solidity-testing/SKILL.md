---
name: solidity-testing
description: Advanced Foundry testing strategies including unit, fuzz, invariant, fork, and differential testing for Solidity contracts. Use when writing comprehensive test suites, designing handlers for invariants, setting up fuzz campaigns, or improving coverage. Triggers include forge test, invariant, fuzz test, handler, fork test, coverage, differential testing, symbolic.
---

# Solidity Testing

## Overview

Write high-assurance test suites that catch both logic bugs and economic edge cases.

## Test Types

### Unit Tests
- Happy path + every revert condition
- Use `vm.expectRevert` with selectors
- Cover access control boundaries

### Fuzz Tests
- Bound inputs sensibly with `bound()` or `vm.assume`
- Focus on mathematical properties and state transitions
- Run with higher runs for critical functions (`forge test --fuzz-runs 10000`)

### Invariant Tests
- Define protocol invariants clearly (e.g. totalAssets >= totalSupply * rate, solvency)
- Use Handler contracts that call the system in random but valid sequences
- Prefer `targetContract` / `targetSelector` to focus the fuzzer
- Ghost variables to track cumulative effects

### Fork Tests
- Test against live mainnet/L2 state
- Useful for integration with external protocols
- Be aware of state changes and RPC rate limits

### Differential / Equivalence
- Compare new implementation against reference or previous version

## Best Practices

- One behavioral assertion per test when possible
- Descriptive test names
- Use `vm.prank` / `vm.startPrank` consistently
- Snapshot gas for critical paths
- Fail tests on any unexpected event or state change when relevant

## Coverage Goals

Aim for high branch coverage on core logic, but prioritize property-based and invariant testing over 100% line coverage theater.

## Code Examples

See \`references/code-examples.md\` for concrete Solidity / Foundry snippets relevant to this skill.
