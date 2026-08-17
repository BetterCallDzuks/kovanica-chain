# Key EVM Opcode Gas Costs (approximate, post-London / Cancun)

These are base costs; actual costs depend on cold/warm access, refunds, and current hard fork.

| Opcode / Action              | Approx Gas | Notes |
|-----------------------------|------------|-------|
| SLOAD (cold)                | 2100       | First access to slot |
| SLOAD (warm)                | 100        | |
| SSTORE (0 → non-zero)       | 20000      | + cold access |
| SSTORE (non-zero → non-zero)| 2900       | |
| SSTORE (non-zero → 0)       | 100 + refund | Refunds capped |
| MLOAD / MSTORE              | 3          | |
| CALLDATALOAD                | 3          | |
| CALL (base)                 | 100+       | + value transfer, account creation, etc. |
| DELEGATECALL                | similar    | |
| CREATE / CREATE2            | 32000+     | + code deposit |
| KECCAK256                   | 30 + 6/word| |
| LOG0–LOG4                   | 375+       | + topics + data |
| BALANCE / EXTCODESIZE (cold)| 2600       | |

## Practical Implications

- Storage dominates cost for most contracts → pack, cache, use immutable.
- Calldata is cheaper than memory for external inputs.
- Custom errors cost far less than `require(..., "string")`.
- Avoid unnecessary external calls and storage writes in loops.
- Measure with `forge test --gas-report` on the target chain / fork.
