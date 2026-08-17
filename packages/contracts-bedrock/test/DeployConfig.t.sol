// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Test} from "forge-std/Test.sol";

/// @notice Validates the human-readable deploy-config intent files against the
///         network-stage invariants documented in CLAUDE.md. These are pure
///         JSON assertions (no core OP Stack contracts are deployed here); the
///         goal is to catch a config drift — e.g. a public network left with
///         dev accounts funded — before it ever reaches op-deployer.
/// @dev    fs read access to ./deploy-config is granted in foundry.toml.
contract DeployConfigTest is Test {
    string internal constant DEVNET_PATH = "deploy-config/devnet.json";
    string internal constant SEPOLIA_PATH = "deploy-config/sepolia.json";

    string internal devnetJson;
    string internal sepoliaJson;

    function setUp() public {
        devnetJson = vm.readFile(DEVNET_PATH);
        sepoliaJson = vm.readFile(SEPOLIA_PATH);
    }

    // --- devnet.json -------------------------------------------------------

    /// @notice The devnet targets permissionless fault proofs (CANNON), so
    ///         useFaultProofs must be on and respectedGameType must be 0.
    function test_devnet_faultProofsPermissionless() public view {
        bool useFaultProofs = vm.parseJsonBool(devnetJson, ".useFaultProofs");
        assertTrue(useFaultProofs, "devnet: useFaultProofs must be true");

        uint256 respectedGameType = vm.parseJsonUint(devnetJson, ".respectedGameType");
        assertEq(respectedGameType, 0, "devnet: respectedGameType must be 0 (permissionless CANNON)");
    }

    /// @notice Local devnets fund the dev accounts for convenience.
    function test_devnet_fundsDevAccounts() public view {
        bool fundDevAccounts = vm.parseJsonBool(devnetJson, ".fundDevAccounts");
        assertTrue(fundDevAccounts, "devnet: fundDevAccounts must be true");
    }

    /// @notice A prestate must be present and well-formed; a placeholder hash
    ///         is fine at this stage, but the zero hash is not (it would mean
    ///         no Cannon prestate was wired up at all).
    function test_devnet_absolutePrestatePresent() public view {
        bytes32 prestate = vm.parseJsonBytes32(devnetJson, ".faultGameAbsolutePrestate");
        assertTrue(prestate != bytes32(0), "devnet: faultGameAbsolutePrestate must be set (non-zero)");
    }

    // --- sepolia.json ------------------------------------------------------

    /// @notice Sepolia is a public testnet: fault proofs must be enabled.
    function test_sepolia_faultProofsEnabled() public view {
        bool useFaultProofs = vm.parseJsonBool(sepoliaJson, ".useFaultProofs");
        assertTrue(useFaultProofs, "sepolia: useFaultProofs must be true");
    }

    /// @notice A public network must NOT fund dev accounts.
    function test_sepolia_doesNotFundDevAccounts() public view {
        bool fundDevAccounts = vm.parseJsonBool(sepoliaJson, ".fundDevAccounts");
        assertFalse(fundDevAccounts, "sepolia: fundDevAccounts must be false for a public network");
    }

    /// @notice During bring-up the respected game type is either 1
    ///         (PermissionedDisputeGame) or 0 (permissionless CANNON); any
    ///         other value is an invalid configuration.
    function test_sepolia_respectedGameTypeValid() public view {
        uint256 respectedGameType = vm.parseJsonUint(sepoliaJson, ".respectedGameType");
        assertTrue(
            respectedGameType == 0 || respectedGameType == 1,
            "sepolia: respectedGameType must be 0 (CANNON) or 1 (PERMISSIONED)"
        );
    }

    /// @notice The ownership address fields must be present and parse as
    ///         addresses. We deliberately do NOT assert they are non-zero:
    ///         they are intentional placeholders filled in at deploy time with
    ///         SAFE accounts.
    function test_sepolia_ownershipFieldsParse() public view {
        // Each call reverts if the key is missing or not a valid address, so
        // collecting them into an array is itself the presence/well-formed
        // assertion. We do NOT check non-zero: these are intentional
        // placeholders filled with SAFE accounts at deploy time.
        address[4] memory owners = [
            vm.parseJsonAddress(sepoliaJson, ".proxyAdminOwner"),
            vm.parseJsonAddress(sepoliaJson, ".systemConfigOwner"),
            vm.parseJsonAddress(sepoliaJson, ".guardian"),
            vm.parseJsonAddress(sepoliaJson, ".challenger")
        ];
        assertEq(owners.length, 4, "sepolia: all four ownership address fields must be present and parse");
    }
}
