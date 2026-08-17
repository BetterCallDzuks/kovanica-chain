// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

/// @title Counter
/// @notice Throwaway Foundry scaffold used only to prove the toolchain builds
///         and CI runs. NOT part of kovanica-chain's contract set — delete once
///         real contracts land. This is intentionally not a bridge or predeploy.
contract Counter {
    uint256 public number;

    function setNumber(uint256 newNumber) public {
        number = newNumber;
    }

    function increment() public {
        number++;
    }
}
