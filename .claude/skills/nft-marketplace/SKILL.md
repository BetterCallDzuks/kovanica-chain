---
name: nft-marketplace
description: NFT marketplace and collection patterns including listings, offers, auctions, royalties (ERC-2981), lazy minting, and security considerations. Use when building or reviewing NFT marketplaces, collection contracts, or trading flows. Triggers include NFT marketplace, Seaport, listing, offer, auction, royalty, ERC-2981, lazy mint, setApprovalForAll, collection.
---

# NFT Marketplace

## Overview

Build secure NFT trading systems and collection contracts with correct royalty handling and minimal approval surface.

## Core Patterns

### Listings & Offers
- Prefer off-chain signed orders (Seaport-style or similar) over on-chain order books when possible.
- Always validate signatures with EIP-712 and nonces / expiration.
- Support partial fills carefully.

### Royalties
- Implement ERC-2981.
- Marketplaces should honor royalties but be aware that enforcement is not universal on-chain.
- Consider operator filter or similar mechanisms if required by the ecosystem.

### Approvals
- `setApprovalForAll` is powerful and dangerous — warn users and prefer per-token approvals when feasible.
- Marketplaces should not require permanent unlimited approvals if alternative designs exist.

### Lazy Minting
- Server or creator signs a voucher; the first buyer mints on-chain.
- Protect against replay and ensure supply limits are enforced on-chain.

### Auctions
- English, Dutch, and reserve auctions each have different MEV and griefing profiles.
- Prefer pull-based claim patterns for proceeds.

## Security Checklist

- Reentrancy on NFT receiver hooks
- Royalty bypass via wrapping or secondary markets
- Front-running of listings / cancellations
- Signature malleability and replay across chains
- Metadata mutability and rug surfaces
- Enumerable extensions gas costs at scale

## Recommendation

For full marketplaces, start from audited order engines (Seaport or equivalents) rather than inventing a new matching engine unless requirements demand it.

## Code Examples

See \`references/code-examples.md\` for concrete Solidity / Foundry snippets relevant to this skill.
