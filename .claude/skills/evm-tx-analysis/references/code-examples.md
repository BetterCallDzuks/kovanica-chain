# EVM Tx Analysis — Examples & Patterns

## Decoding Flow (conceptual)
1. Extract selector = `bytes4(calldata[0:4])`
2. Look up selector (4byte.directory / verified ABI / whatsabi)
3. ABI-decode remaining bytes against the function signature
4. Enrich addresses (token symbols, contract names) and format amounts with correct decimals
5. Run safety heuristics:
   - unlimited approval?
   - setApprovalForAll?
   - ownership / upgrade calls?
   - low slippage / missing deadline?
   - unverified contract?

## Example Human Summary Output
```
This transaction calls `approve(address,uint256)` on USDC (0xA0b8...).

Parameters:
  spender: Uniswap V3 Router (0xE592...)
  amount:  unlimited (type(uint256).max)

Risk: High — grants unlimited spending rights to the router.
Recommendation: Prefer exact allowance or revoke after use. Only sign if you intend to trade on Uniswap.
```

## Simulation Preference
When an RPC is available, prefer `cast call` / `cast run` or a simulator to observe state changes and events before advising the user to sign.
