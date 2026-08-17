# Common Secure Patterns

## Access Control
Prefer OpenZeppelin AccessControl or Ownable2Step.

```solidity
import {Ownable2Step, Ownable} from "@openzeppelin/contracts/access/Ownable2Step.sol";

contract MyContract is Ownable2Step {
    constructor(address initialOwner) Ownable(initialOwner) {}
}
```

## Pull-over-Push Payments
```solidity
mapping(address => uint256) public pendingWithdrawals;

function withdraw() external {
    uint256 amount = pendingWithdrawals[msg.sender];
    pendingWithdrawals[msg.sender] = 0;
    (bool success, ) = msg.sender.call{value: amount}("");
    require(success, "Transfer failed");
}
```

## Safe ERC-20
Always use SafeERC20 for external tokens.

```solidity
using SafeERC20 for IERC20;
token.safeTransfer(to, amount);
token.safeTransferFrom(from, to, amount);
```

## Custom Errors
```solidity
error Unauthorized();
error InsufficientBalance(uint256 available, uint256 required);

if (msg.sender != owner) revert Unauthorized();
```

## Immutable & Constant
```solidity
address public immutable FACTORY;
uint256 public constant FEE_BPS = 30;
```

## State Machine
```solidity
enum Phase { Setup, Active, Paused, Closed }
Phase public phase;

modifier inPhase(Phase expected) {
    if (phase != expected) revert WrongPhase();
    _;
}
```
