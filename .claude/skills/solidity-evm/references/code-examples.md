# Solidity EVM — Core Code Examples

## Minimal Secure Ownable Contract
```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Ownable2Step, Ownable} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title ExampleVault
/// @notice Minimal pull-payment vault with two-step ownership
contract ExampleVault is Ownable2Step, ReentrancyGuard {
    mapping(address => uint256) public balances;

    error InsufficientBalance();
    error ZeroAddress();

    event Deposited(address indexed user, uint256 amount);
    event Withdrawn(address indexed user, uint256 amount);

    constructor(address initialOwner) Ownable(initialOwner) {}

    function deposit() external payable {
        balances[msg.sender] += msg.value;
        emit Deposited(msg.sender, msg.value);
    }

    function withdraw(uint256 amount) external nonReentrant {
        uint256 bal = balances[msg.sender];
        if (amount > bal) revert InsufficientBalance();
        balances[msg.sender] = bal - amount;
        (bool ok, ) = msg.sender.call{value: amount}("");
        require(ok, "ETH transfer failed");
        emit Withdrawn(msg.sender, amount);
    }
}
```

## Custom Errors + Events Pattern
```solidity
error Unauthorized();
error InvalidAmount(uint256 provided, uint256 minimum);

event ParameterUpdated(bytes32 indexed key, uint256 oldValue, uint256 newValue);

function setParam(uint256 newValue) external onlyOwner {
    if (newValue < 1e18) revert InvalidAmount(newValue, 1e18);
    uint256 old = param;
    param = newValue;
    emit ParameterUpdated("param", old, newValue);
}
```

## Safe ERC-20 Interaction
```solidity
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

using SafeERC20 for IERC20;

function pullTokens(IERC20 token, address from, uint256 amount) internal {
    token.safeTransferFrom(from, address(this), amount);
}
```
