// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Counter} from "../src/example/Counter.sol";
import {Test} from "forge-std/Test.sol";

/// @notice Scaffold test proving forge build/test works in CI. Delete with the
///         example contract once real contracts land.
contract CounterTest is Test {
    Counter internal counter;

    function setUp() public {
        counter = new Counter();
        counter.setNumber(0);
    }

    function test_increment() public {
        counter.increment();
        assertEq(counter.number(), 1);
    }

    function testFuzz_setNumber(uint256 x) public {
        counter.setNumber(x);
        assertEq(counter.number(), x);
    }
}
