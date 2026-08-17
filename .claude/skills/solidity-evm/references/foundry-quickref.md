# Foundry Quick Reference

## Project
- `forge init`
- `forge install <github-repo>`
- `forge update`
- `forge remappings` 

## Build & Test
- `forge build`
- `forge test`
- `forge test -vvv` / `-vvvv`
- `forge test --match-test testName`
- `forge test --match-contract ContractName`
- `forge test --gas-report`
- `forge coverage`
- `forge snapshot`

## Scripts & Deploy
- `forge script script/Deploy.s.sol --rpc-url $RPC --broadcast --verify -vvvv`

## Cast (RPC Swiss Army Knife)
- `cast call <addr> "fn(args)"`
- `cast send <addr> "fn(args)" --private-key $PK`
- `cast 4byte <selector>`
- `cast 4byte-decode <calldata>`
- `cast abi-encode "fn(types)" args`
- `cast storage <addr> <slot>`
- `cast code <addr>`
- `cast balance <addr>`
- `cast nonce <addr>`
- `cast block-number`
- `cast chain-id`

## Anvil
- `anvil`
- `anvil --fork-url $RPC --fork-block-number <n>`
