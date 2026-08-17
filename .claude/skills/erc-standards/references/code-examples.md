# ERC Standards — Code Examples

## ERC-20 with Permit (OpenZeppelin)
```solidity
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";

contract MyToken is ERC20, ERC20Permit {
    constructor() ERC20("MyToken", "MTK") ERC20Permit("MyToken") {
        _mint(msg.sender, 1_000_000 ether);
    }
}
```

## SafeERC20 Usage
```solidity
using SafeERC20 for IERC20;

IERC20 token = IERC20(tokenAddress);
token.safeTransfer(to, amount);
token.safeTransferFrom(from, to, amount);
token.forceApprove(spender, amount); // OZ helper for non-standard tokens
```

## Minimal ERC-721
```solidity
import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

contract MyNFT is ERC721, Ownable {
    uint256 private _nextId;

    constructor() ERC721("MyNFT", "MNFT") Ownable(msg.sender) {}

    function mint(address to) external onlyOwner returns (uint256 id) {
        id = ++_nextId;
        _safeMint(to, id);
    }
}
```

## ERC-165 Interface Check
```solidity
import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";

function supportsInterface(bytes4 interfaceId) public view virtual override returns (bool) {
    return interfaceId == type(IERC721).interfaceId || super.supportsInterface(interfaceId);
}
```

## EIP-712 Domain
```solidity
bytes32 private constant DOMAIN_TYPEHASH = keccak256(
    "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"
);

function _domainSeparator() internal view returns (bytes32) {
    return keccak256(abi.encode(
        DOMAIN_TYPEHASH,
        keccak256(bytes("MyApp")),
        keccak256(bytes("1")),
        block.chainid,
        address(this)
    ));
}
```
