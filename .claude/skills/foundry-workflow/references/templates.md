# Foundry Templates

## Minimal foundry.toml
```toml
[profile.default]
src = "src"
out = "out"
libs = ["lib"]
solc_version = "0.8.28"
optimizer = true
optimizer_runs = 200
fs_permissions = [{ access = "read-write", path = "./"}]

[rpc_endpoints]
mainnet = "${MAINNET_RPC_URL}"
sepolia = "${SEPOLIA_RPC_URL}"
base = "${BASE_RPC_URL}"

[etherscan]
mainnet = { key = "${ETHERSCAN_API_KEY}" }
```

## Basic Deploy Script
```solidity
// script/Deploy.s.sol
pragma solidity ^0.8.28;

import {Script, console2} from "forge-std/Script.sol";
import {MyContract} from "../src/MyContract.sol";

contract Deploy is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(deployerKey);

        MyContract c = new MyContract(msg.sender);
        console2.log("Deployed at:", address(c));

        vm.stopBroadcast();
    }
}
```

## Basic Test
```solidity
// test/MyContract.t.sol
pragma solidity ^0.8.28;

import {Test, console2} from "forge-std/Test.sol";
import {MyContract} from "../src/MyContract.sol";

contract MyContractTest is Test {
    MyContract public c;
    address public user = makeAddr("user");

    function setUp() public {
        c = new MyContract(address(this));
    }

    function test_InitialState() public view {
        assertEq(c.owner(), address(this));
    }

    function test_RevertWhen_Unauthorized() public {
        vm.prank(user);
        vm.expectRevert(); // or specific error
        // c.privilegedFunction();
    }
}
```

## Invariant + Handler Skeleton
```solidity
// test/invariant/Handler.sol + Invariant.t.sol
// Handler calls the system with bounded random inputs
// Invariant contract asserts global properties after each call sequence
```

## Useful Cheatcodes
- `vm.prank` / `vm.startPrank` / `vm.stopPrank`
- `vm.deal` / `vm.hoax`
- `vm.warp` / `vm.roll`
- `vm.expectRevert` / `vm.expectEmit`
- `vm.store` / `vm.load` (storage manipulation)
- `vm.createSelectFork`
- `bound(x, min, max)`
