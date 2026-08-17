---
name: solidity-assembly
description: Yul and inline assembly guidance for Solidity when gas or low-level control is required. Use for optimized hot paths, custom memory management, efficient hashing, or when Solidity cannot express the needed behavior. Triggers include assembly, Yul, inline assembly, mstore, mload, calldataload, scratch space, free memory pointer, custom error assembly.
---

# Solidity Assembly

## Overview

Use inline assembly / Yul only when the gas or control benefit clearly outweighs the readability and safety cost. Prefer pure Solidity first.

## Safe Usage Rules

1. Document every assembly block with the intent and why Solidity is insufficient.
2. Do not touch the free memory pointer (0x40) unless you fully understand allocation.
3. Prefer the Solidity scratch space (0x00–0x3f) for temporary values.
4. Never leave memory in an inconsistent state that later Solidity code will misinterpret.
5. Avoid `call`, `delegatecall`, `staticcall` in assembly unless you also handle return data and success correctly.
6. Custom errors can be efficiently emitted from assembly.

## Common Patterns

### Efficient keccak of small data
```solidity
assembly {
    mstore(0x00, value)
    let hash := keccak256(0x00, 0x20)
}
```

### Custom error
```solidity
assembly {
    mstore(0x00, 0x08c379a0) // Error(string) selector example — prefer custom errors
    // better: use the custom error selector directly
}
```

### Memory-safe allocation
Only advance the free memory pointer when you actually allocate something that must persist.

## When to Reach for Assembly

- Extremely hot loops where every gas matters
- Custom packing / unpacking that the compiler does not optimize well
- Interfacing with precompiles or non-standard return data
- Writing highly optimized libraries (after measurement)

## Testing Requirement

Any assembly-containing function must have dedicated unit + fuzz tests that exercise edge cases the compiler would normally protect against.

## Code Examples

See \`references/code-examples.md\` for concrete Solidity / Foundry snippets relevant to this skill.
