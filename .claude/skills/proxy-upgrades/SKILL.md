---
name: proxy-upgrades
description: Proxy patterns and upgradeable contract safety for EVM including UUPS, Transparent, Beacon, and Diamond (EIP-2535). Use when designing upgradeable systems, reviewing storage layouts, writing initializers, or performing upgrade safety checks. Triggers include proxy, UUPS, Transparent proxy, Beacon, Diamond, EIP-2535, upgradeable, storage layout, initializer, ERC-1967.
---

# Proxy Upgrades

## Overview

Design and review upgradeable contracts with correct storage layout, initialization, and authorization.

## Preferred Patterns (2026)

1. **UUPS** (ERC-1822 + ERC-1967) — most common and gas-efficient for single implementation upgrades. Authorization lives in the implementation.
2. **Transparent Proxy** — admin cannot accidentally call implementation functions; slightly higher gas.
3. **Beacon** — multiple proxies share one implementation pointer.
4. **Diamond (EIP-2535)** — for very large systems that need modular facets; higher complexity.

## Critical Safety Rules

- Never leave an implementation contract initializable by anyone. Call `_disableInitializers()` in the implementation constructor.
- Storage layout must be append-only. Never reorder, remove, or change types of existing variables.
- Use storage gaps (`uint256[50] private __gap;`) in base contracts that may be extended.
- Upgrade authorization must be restricted (ideally Ownable2Step + Timelock).
- Test storage layout compatibility with tools or Foundry storage dumps before upgrading.
- Avoid `selfdestruct` in upgradeable contracts.
- Constructor logic belongs in `initialize` (or reinitializer for subsequent versions).

## Storage Collision Checklist

- Implementation variables do not collide with proxy reserved slots (ERC-1967 slots).
- Inherited contracts keep consistent layout across versions.
- No unstructured storage overwrites critical slots.

## Recommendation

Default to UUPS + OpenZeppelin Upgradeable contracts unless the system clearly needs Diamond modularity. Always pair with a timelock for production upgrades.

## Code Examples

See \`references/code-examples.md\` for concrete Solidity / Foundry snippets relevant to this skill.
