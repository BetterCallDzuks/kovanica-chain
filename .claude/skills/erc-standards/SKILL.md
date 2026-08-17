---
name: erc-standards
description: Detailed guidance on major Ethereum token and interface standards including ERC-20, ERC-721, ERC-1155, ERC-4626, ERC-2981, EIP-712, ERC-165, ERC-4337, and related extensions. Use when implementing or reviewing tokens, NFTs, vaults, royalties, typed signatures, or interface detection. Triggers include ERC-20, ERC-721, ERC-1155, ERC-4626, EIP-712, Permit, SafeERC20, NFT, royalty, interfaceId.
---

# ERC Standards

## Overview

Implement and review token and interface standards correctly, including common pitfalls and recommended extensions.

## ERC-20
- Always use SafeERC20 for external interactions.
- Handle non-standard tokens (USDT-style missing return, fee-on-transfer, rebasing) explicitly or reject them.
- Prefer EIP-2612 Permit for gasless approvals.
- Capped, burnable, pausable variants via OpenZeppelin.

## ERC-721 / ERC-1155
- Metadata (tokenURI) should be robust; prefer on-chain or reliable IPFS.
- Enumerable extensions have gas costs — use only when needed.
- Royalties via ERC-2981.
- Be careful with callbacks (onERC721Received / onERC1155Received) and reentrancy.

## ERC-4626
- Full interface compliance.
- Protect against inflation / donation attacks (virtual offset or dead shares).
- Document rounding behavior.
- Fees should be taken in a way that does not break share accounting.

## EIP-712
- Use for structured data signatures (orders, permits, meta-transactions).
- Domain separator must include name, version, chainId, verifyingContract.
- Never reuse nonces incorrectly.

## Interface Detection
- ERC-165 for supportsInterface.
- Be precise with interfaceIds.

## General Advice
- Prefer OpenZeppelin implementations as the starting point.
- Document any deviations from the standard.
- Test against both standard-compliant and known non-standard tokens.

## Code Examples

See \`references/code-examples.md\` for concrete Solidity / Foundry snippets relevant to this skill.
