# Proxy Upgrades — Code Examples

## UUPS Implementation Skeleton
```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

contract MyContractV1 is Initializable, OwnableUpgradeable, UUPSUpgradeable {
    uint256 public value;

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(address initialOwner) external initializer {
        __Ownable_init(initialOwner);
        __UUPSUpgradeable_init();
        value = 1;
    }

    function setValue(uint256 newValue) external onlyOwner {
        value = newValue;
    }

    function _authorizeUpgrade(address) internal override onlyOwner {}
}
```

## Storage Gap Example
```solidity
abstract contract BaseUpgradeable is Initializable {
    uint256 public baseValue;
    uint256[49] private __gap; // reserve slots for future variables
}
```

## Transparent Proxy Note
OpenZeppelin's TransparentUpgradeableProxy separates admin from implementation calls. Prefer UUPS for most new projects unless you need the extra admin isolation.

## Diamond (EIP-2535) — High Level
Use only when the system is large enough to justify facet modularity. Storage is shared via diamond storage pattern (struct at specific slot). Complexity is high — audit carefully.
