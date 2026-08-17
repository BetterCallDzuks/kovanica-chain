# MEV — Code Examples

## Slippage Protection on Swap
```solidity
function swapExactIn(
    uint256 amountIn,
    uint256 minAmountOut,   // caller-controlled slippage bound
    address to
) external returns (uint256 amountOut) {
    // ... perform swap ...
    if (amountOut < minAmountOut) revert InsufficientOutput();
    // transfer amountOut to `to`
}
```

## Deadline Protection
```solidity
error Expired();

modifier ensure(uint256 deadline) {
    if (block.timestamp > deadline) revert Expired();
    _;
}

function swap(..., uint256 deadline) external ensure(deadline) {
    // ...
}
```

## Commit-Reveal Sketch (for sensitive actions)
```solidity
mapping(address => bytes32) public commitments;

function commit(bytes32 hash) external {
    commitments[msg.sender] = hash;
}

function reveal(uint256 value, bytes32 salt) external {
    require(keccak256(abi.encodePacked(value, salt, msg.sender)) == commitments[msg.sender]);
    delete commitments[msg.sender];
    // execute action with `value`
}
```

## Private Orderflow Recommendation (off-chain)
For large swaps, prefer submitting via Flashbots Protect, MEV Blocker, or similar private RPCs rather than the public mempool. This cannot be enforced purely on-chain.
