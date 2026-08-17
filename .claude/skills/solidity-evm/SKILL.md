---
name: solidity-evm
description: Comprehensive Solidity and EVM smart contract development skill for writing, reviewing, optimizing, and shipping production-grade contracts on Ethereum and EVM chains. Use when writing Solidity, designing contracts, reviewing code, working with Foundry or Hardhat, implementing ERCs, gas optimization, security patterns, proxies, or any EVM smart contract task. Triggers include Solidity, smart contract, EVM, Foundry, Hardhat, ERC-20, ERC-721, ERC-4626, UUPS, Diamond, gas report, audit checklist.
---

# Solidity EVM

## Overview

Turn the agent into a senior Solidity engineer capable of designing, implementing, testing, optimizing, and securing production smart contracts on Ethereum and EVM-compatible chains.

## Core Principles

- Prefer Foundry (forge, cast, anvil) as the primary toolchain in 2026.
- Security-first: every function must consider access control, reentrancy, oracle risk, and economic attacks.
- Gas-conscious: storage packing, custom errors, calldata, immutable/constant, and measured optimization.
- Use OpenZeppelin Contracts as the default secure base (Ownable2Step, AccessControl, SafeERC20, etc.).
- Write NatSpec for all public/external functions and state variables.
- Prefer pull-over-push for token/ETH transfers.
- Test with unit + fuzz + invariant tests before any deployment discussion.
- Never hardcode mainnet addresses without verification; use named constants or config.

## Workflow

1. Clarify requirements, assets at risk, and target chains.
2. Design architecture (minimal contracts, clear ownership, upgrade strategy if needed).
3. Implement with security patterns from the start.
4. Write comprehensive Foundry tests (unit, fuzz, invariant with handlers).
5. Run gas reports and optimize hot paths.
6. Perform threat model and checklist review (see solidity-security skill).
7. Deploy via scripts with verification and post-deploy checks.

## When to load related skills

- Deep security review or audit → load `solidity-security`
- Gas deep-dive or optimization → load `gas-optimization`
- Foundry commands, config, CI → load `foundry-workflow`
- DeFi protocols, vaults, AMMs, lending → load `defi-patterns`
- L2-specific behavior, bridges, multichain → load `l2-multichain`
- Token standards details → load `erc-standards`
- Proxy patterns and upgrades → load `proxy-upgrades`
- Transaction decoding and safety → load `evm-tx-analysis`
- ERC-4337 / account abstraction → load `account-abstraction`
- Advanced testing strategies → load `solidity-testing`
- MEV, sandwich, frontrunning → load `mev`
- Price feeds and oracle safety → load `oracles`
- NFT marketplaces and royalties → load `nft-marketplace`
- Governor, Timelock, DAO → load `governance`
- Yul / inline assembly → load `solidity-assembly`

## Key References

Read on demand from `references/`:

- `references/code-examples.md` — concrete Solidity patterns
- `references/security-checklist.md` — pre-deploy audit items
- `references/common-patterns.md` — access control, pull payments, state machines
- `references/foundry-quickref.md` — essential forge/cast commands
- `references/common-addresses.md` — guidance on handling addresses

## Output Standards

- Always produce compilable Solidity (pragma ^0.8.24 or higher unless specified).
- Include full NatSpec.
- Prefer custom errors over require strings.
- Use named imports from OpenZeppelin.
- Provide Foundry test skeleton when generating contracts.
- Flag any irreversible actions (ownership renounce, mint, upgrade) clearly.
