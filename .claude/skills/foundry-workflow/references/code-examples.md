# Foundry Workflow — Code Examples

## Basic Test with Cheatcodes
```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test, console2} from "forge-std/Test.sol";
import {MyToken} from "../src/MyToken.sol";

contract MyTokenTest is Test {
    MyToken token;
    address alice = makeAddr("alice");
    address bob = makeAddr("bob");

    function setUp() public {
        token = new MyToken("Test", "TST", 1_000_000 ether);
        token.transfer(alice, 100 ether);
    }

    function test_Transfer() public {
        vm.prank(alice);
        token.transfer(bob, 10 ether);
        assertEq(token.balanceOf(bob), 10 ether);
    }

    function test_RevertWhen_InsufficientBalance() public {
        vm.prank(alice);
        vm.expectRevert();
        token.transfer(bob, 1000 ether);
    }

    function testFuzz_Transfer(uint256 amount) public {
        amount = bound(amount, 1, token.balanceOf(alice));
        vm.prank(alice);
        token.transfer(bob, amount);
        assertEq(token.balanceOf(bob), amount);
    }
}
```

## Deploy Script
```solidity
// script/Deploy.s.sol
pragma solidity ^0.8.28;

import {Script, console2} from "forge-std/Script.sol";
import {MyContract} from "../src/MyContract.sol";

contract Deploy is Script {
    function run() external returns (MyContract) {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(pk);
        MyContract c = new MyContract(msg.sender);
        console2.log("Deployed:", address(c));
        vm.stopBroadcast();
        return c;
    }
}
```

## Fork Test
```solidity
function setUp() public {
    vm.createSelectFork(vm.envString("MAINNET_RPC_URL"));
    // interact with live contracts
}
```

## Invariant Handler Sketch
```solidity
contract Handler is Test {
    MyProtocol protocol;
    address[] actors;

    constructor(MyProtocol p) {
        protocol = p;
        actors.push(makeAddr("actor1"));
    }

    function deposit(uint256 amount) public {
        amount = bound(amount, 1, 100 ether);
        address actor = actors[bound(uint256(uint160(msg.sender)), 0, actors.length - 1)];
        vm.deal(actor, amount);
        vm.prank(actor);
        protocol.deposit{value: amount}();
    }
}
```
