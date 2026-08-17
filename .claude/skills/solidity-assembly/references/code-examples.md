# Solidity Assembly — Code Examples

## Efficient Hash of a Single Word
```solidity
function hash(uint256 value) pure returns (bytes32 result) {
    assembly {
        mstore(0x00, value)
        result := keccak256(0x00, 0x20)
    }
}
```

## Custom Error from Assembly
```solidity
error Unauthorized();

function onlyOwnerAssembly() view {
    if (msg.sender != owner) {
        assembly {
            // mstore selector of Unauthorized()
            mstore(0x00, 0x82b42900) // example — use correct selector
            revert(0x1c, 0x04)
        }
    }
}
```

## Load Calldata Efficiently
```solidity
function getFirstArg() pure returns (uint256 arg) {
    assembly {
        arg := calldataload(0x04) // skip 4-byte selector
    }
}
```

## Memory-Safe Note
```solidity
// Do NOT do this unless you understand free memory pointer
assembly {
    let ptr := mload(0x40)
    // write data...
    mstore(0x40, add(ptr, 0x40)) // advance free memory pointer
}
```

## When to Prefer Solidity
If the compiler already produces good code, stay in high-level Solidity. Measure with `forge test --gas-report` before introducing assembly.
