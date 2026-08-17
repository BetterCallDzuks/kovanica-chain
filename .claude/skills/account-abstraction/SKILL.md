---
name: account-abstraction
description: ERC-4337 account abstraction guidance including smart accounts, UserOperations, paymasters, bundlers, and EntryPoint interactions. Use when building or reviewing smart wallets, gas sponsorship, session keys, or AA-related contracts and flows. Triggers include ERC-4337, account abstraction, UserOperation, paymaster, smart account, EntryPoint, bundler, session key, gasless.
---

# Account Abstraction

## Overview

Build and reason about ERC-4337 smart accounts, UserOperations, and related infrastructure correctly.

## Core Concepts

- **EntryPoint** — singleton contract that validates and executes UserOperations.
- **Smart Account** — contract wallet that implements validation logic (signature, session keys, etc.).
- **UserOperation** — the struct that replaces a traditional transaction for AA flows.
- **Paymaster** — optional contract that can sponsor gas.
- **Bundler** — off-chain actor that submits UserOperations to the EntryPoint via handleOps.

## Implementation Notes

- Validation must be careful about gas limits and forbidden opcodes during validation phase.
- Signature schemes often use EIP-712 or raw secp256k1 / P256.
- Session keys and permissions should be tightly scoped and expirable.
- Paymasters need robust validation to avoid griefing or free-gas attacks.
- Aggregators exist for signature aggregation but add complexity.

## Security Priorities

- Ensure the account cannot be bricked by bad validation logic.
- Protect against signature replay across chains or EntryPoints.
- Limit what a compromised session key can do.
- Paymaster deposit management and staking requirements.

## Practical Advice

Prefer audited account implementations (Kernel, Safe4337Module, LightAccount, etc.) as starting points rather than writing a full account from scratch unless the requirements demand it.

## Code Examples

See \`references/code-examples.md\` for concrete Solidity / Foundry snippets relevant to this skill.
