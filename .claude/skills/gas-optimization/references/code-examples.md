# Gas Optimization — Code Examples

## Storage Packing
```solidity
// Before: 3 slots
struct Bad {
    uint128 a;
    uint256 b;
    uint128 c;
}

// After: 2 slots
struct Good {
    uint128 a;
    uint128 c;
    uint256 b;
}
```

## Cache Storage Reads
```solidity
// Bad — multiple SLOADs
function bad(address user) external view returns (uint256) {
    return balances[user] + allowances[user][msg.sender] + rewards[user];
}

// Good — cache
function good(address user) external view returns (uint256) {
    uint256 bal = balances[user];
    uint256 all = allowances[user][msg.sender];
    uint256 rew = rewards[user];
    return bal + all + rew;
}
```

## Custom Errors vs Require Strings
```solidity
// Expensive
require(amount > 0, "Amount must be greater than zero");

// Cheap
error ZeroAmount();
if (amount == 0) revert ZeroAmount();
```

## Calldata for External Inputs
```solidity
// Prefer calldata for read-only array/string inputs
function process(uint256[] calldata amounts) external {
    // ...
}
```

## Unchecked Increment in Loops
```solidity
for (uint256 i = 0; i < len; ) {
    // body
    unchecked { ++i; }
}
```

## Immutable Constants
```solidity
address public immutable FACTORY;
uint256 public constant FEE_BPS = 30; // 0.3%

constructor(address factory) {
    FACTORY = factory;
}
```
