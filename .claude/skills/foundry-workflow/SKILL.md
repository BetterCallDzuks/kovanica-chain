---
name: foundry-workflow
description: Modern Foundry (forge, cast, anvil, chisel) workflow for Solidity development, testing, deployment, and debugging. Use when setting up Foundry projects, writing forge tests, fuzzing, invariants, gas snapshots, scripting deployments, forking mainnet, or using cast for RPC interactions. Triggers include Foundry, forge, cast, anvil, forge test, forge script, foundry.toml, gas snapshot, invariant test, fork test.
---

# Foundry Workflow

## Overview

Use Foundry as the primary Solidity toolchain. Prefer it over Hardhat for new projects in 2026 unless the user explicitly requires Hardhat/JS tooling.

## Project Setup

```bash
forge init my-project
cd my-project
forge install OpenZeppelin/openzeppelin-contracts
```

Key `foundry.toml` settings:
```toml
[profile.default]
src = "src"
out = "out"
libs = ["lib"]
solc = "0.8.28"
optimizer = true
optimizer_runs = 200
via_ir = false   # enable only if needed for stack-too-deep
ffi = false
fs_permissions = [{ access = "read-write", path = "./"}]

[rpc_endpoints]
mainnet = "${MAINNET_RPC_URL}"
sepolia = "${SEPOLIA_RPC_URL}"
```

## Essential Commands

- `forge build` / `forge test`
- `forge test -vvv` (detailed traces)
- `forge test --gas-report`
- `forge snapshot` / `forge snapshot --diff`
- `forge coverage`
- `forge script script/Deploy.s.sol --rpc-url $RPC --broadcast --verify`
- `cast call`, `cast send`, `cast 4byte`, `cast abi-encode`, `cast storage`

## Testing Best Practices

- Use `vm.prank`, `vm.startPrank`, `vm.deal`, `vm.warp`, `vm.roll`, `vm.expectRevert`
- Prefer `vm.expectRevert(CustomError.selector)` 
- Fuzz tests for math and edge values
- Invariant tests with dedicated Handler contracts
- Fork tests for integration against live protocols

## Deployment Scripts

Use `Script` base, `vm.startBroadcast()`, and explicit verification.

Always include post-deploy ownership and configuration checks.

## Debugging

- `forge test --debug <testName>`
- `cast run <txhash>` for existing transactions
- Anvil for local forking: `anvil --fork-url $RPC`

## Code Examples

See \`references/code-examples.md\` for concrete Solidity / Foundry snippets relevant to this skill.
