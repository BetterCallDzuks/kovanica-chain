# Common Addresses Note

**Warning**: Addresses change across chains and can be deprecated. Always verify on the official documentation or a trusted explorer before using in production.

## Approach

Prefer:
1. Official documentation of the protocol
2. On-chain registries or factory contracts
3. Well-known multisig / governance controlled addresses
4. Named constants loaded from config or environment rather than hardcoding in source

## Categories to Track (per chain)

- Native wrapped token (WETH / WMATIC / etc.)
- Major stablecoins (USDC, USDT, DAI) — note USDC has different addresses and bridging behavior
- Uniswap / Aerodrome / other DEX routers and factories
- Chainlink feeds (per asset pair)
- Aave / Compound / Morpho pool addresses
- Official bridges
- Multicall3 (often at the same address on many EVM chains: 0xcA11bde05977b3631167028862bE2a173976CA11)

## Best Practice in Code

```solidity
// Prefer constructor or initializer injection
address public immutable USDC;
address public immutable ROUTER;

constructor(address usdc, address router) {
    USDC = usdc;
    ROUTER = router;
}
```

Or load from a config contract / JSON in deployment scripts.
