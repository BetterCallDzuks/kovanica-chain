---
name: evm-tx-analysis
description: Decode, enrich, and safety-check EVM transactions and calldata before signing or broadcasting. Use for analyzing raw transactions, understanding function calls, detecting phishing or malicious contracts, checking approvals, slippage, and historical behavior. Triggers include decode calldata, analyze transaction, tx safety, phishing check, what does this tx do, 4byte, calldata, simulate tx.
---

# EVM Transaction Analysis

## Overview

Provide clear, human-readable understanding of any EVM transaction or calldata and highlight safety risks before the user signs.

## Analysis Pipeline

1. **Decode**
   - Identify function selector (first 4 bytes).
   - Resolve ABI via verified source, 4byte.directory, or structural guessing when possible.
   - Decode parameters into typed values.

2. **Enrich**
   - Resolve addresses to known contracts / tokens / labels when possible.
   - Format token amounts with correct decimals and symbols.
   - Convert timestamps and block numbers into readable form.
   - Identify proxy implementations if relevant.

3. **Safety Checks**
   - Is the target contract verified?
   - Age and transaction history of the contract.
   - Is this an unlimited approval?
   - Unusual permissions being granted (setApprovalForAll, ownership transfer, etc.).
   - Slippage / deadline parameters on swaps.
   - Possible address poisoning or lookalike contracts.
   - Known malicious patterns or selectors.

4. **Simulation / Context**
   - Prefer simulation (cast or tenderly-style) when an RPC is available.
   - Note expected events and state changes.
   - Historical success/failure rate of the same function if data is available.

## Output Style

- Plain-language summary first: "This transaction will approve the Uniswap Router to spend your USDC..."
- Then structured decoded call.
- Then explicit risk flags (Critical / Warning / Info).
- End with a clear recommendation (safe to sign / review carefully / do not sign).

Never encourage signing if the analysis shows high risk of loss or unknown behavior.

## Code Examples

See \`references/code-examples.md\` for concrete Solidity / Foundry snippets relevant to this skill.
