# Account Abstraction (ERC-4337) — Code Examples

## UserOperation Struct (simplified)
```solidity
struct UserOperation {
    address sender;
    uint256 nonce;
    bytes initCode;
    bytes callData;
    uint256 callGasLimit;
    uint256 verificationGasLimit;
    uint256 preVerificationGas;
    uint256 maxFeePerGas;
    uint256 maxPriorityFeePerGas;
    bytes paymasterAndData;
    bytes signature;
}
```

## Minimal validateUserOp Sketch
```solidity
function validateUserOp(
    UserOperation calldata userOp,
    bytes32 userOpHash,
    uint256 missingAccountFunds
) external returns (uint256 validationData) {
    // 1. Verify signature over userOpHash
    // 2. Check nonce
    // 3. Optionally fund EntryPoint if missingAccountFunds > 0
    // 4. Return validationData (0 = success, or packed success/aggregator/deadline)
}
```

## Paymaster Validation Note
A paymaster must implement `validatePaymasterUserOp` and usually stake with the EntryPoint. It decides whether to sponsor gas and how much.

## Practical Advice
Prefer audited account implementations (e.g. Kernel, LightAccount, Safe 4337 modules) rather than writing a full account from scratch unless requirements demand custom validation logic.
