# L2 Multichain — Code Examples

## Chain-Aware Configuration
```solidity
error UnsupportedChain();

address public immutable USDC;

constructor() {
    uint256 chainId = block.chainid;
    if (chainId == 1) {
        USDC = 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48; // mainnet
    } else if (chainId == 8453) {
        USDC = 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913; // Base
    } else {
        revert UnsupportedChain();
    }
}
```

## CREATE2 Deterministic Address
```solidity
function computeAddress(bytes32 salt, bytes32 bytecodeHash) pure returns (address) {
    return address(uint160(uint256(keccak256(abi.encodePacked(
        bytes1(0xff),
        address(this), // or factory
        salt,
        bytecodeHash
    )))));
}
```

## L2 Sequencer Uptime (see also oracles skill)
Always combine price feeds with sequencer uptime checks on optimistic rollups.

## Foundry Multichain Script Pattern
```solidity
function run() external {
    string memory rpc = vm.envString("RPC_URL");
    vm.createSelectFork(rpc);
    // deploy or interact
}
```
