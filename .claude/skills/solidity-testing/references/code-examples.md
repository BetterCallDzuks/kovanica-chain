# Solidity Testing — Code Examples

## Fuzz Test with Bound
```solidity
function testFuzz_Deposit(uint256 amount) public {
    amount = bound(amount, 1, 1000 ether);
    vm.deal(alice, amount);
    vm.prank(alice);
    vault.deposit{value: amount}();
    assertEq(vault.balanceOf(alice), amount);
}
```

## Expect Custom Error
```solidity
vm.expectRevert(Unauthorized.selector);
vm.prank(attacker);
vault.privilegedCall();
```

## Invariant Test Skeleton
```solidity
contract VaultInvariantTest is Test {
    Vault vault;
    Handler handler;

    function setUp() public {
        vault = new Vault();
        handler = new Handler(vault);
        targetContract(address(handler));
    }

    function invariant_solvency() public view {
        assertGe(address(vault).balance, vault.totalAssets());
    }
}
```

## Fork + Deal
```solidity
function setUp() public {
    vm.createSelectFork(vm.envString("MAINNET_RPC_URL"), 19_000_000);
    deal(USDC, alice, 1_000_000e6); // Foundry deal works for ERC20 too
}
```
