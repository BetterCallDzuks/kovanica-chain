# Security — Code Examples

## Reentrancy Guard + CEI
```solidity
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

mapping(address => uint256) public balances;

function withdraw(uint256 amount) external nonReentrant {
    // Checks
    uint256 bal = balances[msg.sender];
    require(amount <= bal, "insufficient");

    // Effects
    balances[msg.sender] = bal - amount;

    // Interactions
    (bool ok, ) = msg.sender.call{value: amount}("");
    require(ok, "transfer failed");
}
```

## Two-Step Ownership
```solidity
import {Ownable2Step, Ownable} from "@openzeppelin/contracts/access/Ownable2Step.sol";

contract Secure is Ownable2Step {
    constructor(address initialOwner) Ownable(initialOwner) {}
    // owner must call transferOwnership then acceptOwnership
}
```

## Oracle Staleness Check
```solidity
(, int256 price, , uint256 updatedAt, ) = priceFeed.latestRoundData();
if (price <= 0) revert InvalidPrice();
if (block.timestamp - updatedAt > 1 hours) revert StalePrice();
```

## Protect Initializer (Upgradeable)
```solidity
import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

contract Impl is Initializable {
    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(address owner) external initializer {
        // ...
    }
}
```

## Pull-over-Push
```solidity
mapping(address => uint256) public pending;

function claim() external {
    uint256 amount = pending[msg.sender];
    pending[msg.sender] = 0;
    (bool ok, ) = msg.sender.call{value: amount}("");
    require(ok);
}
```
