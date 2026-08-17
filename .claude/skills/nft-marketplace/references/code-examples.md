# NFT Marketplace — Code Examples

## ERC-2981 Royalty
```solidity
import {ERC2981} from "@openzeppelin/contracts/token/common/ERC2981.sol";
import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";

contract MyNFT is ERC721, ERC2981 {
    constructor() ERC721("MyNFT", "MNFT") {
        _setDefaultRoyalty(msg.sender, 500); // 5%
    }

    function supportsInterface(bytes4 interfaceId)
        public view virtual override(ERC721, ERC2981) returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}
```

## Simple On-Chain Listing (for illustration)
```solidity
struct Listing {
    address seller;
    uint256 price;
    bool active;
}

mapping(uint256 => Listing) public listings;

function list(uint256 tokenId, uint256 price) external {
    require(ownerOf(tokenId) == msg.sender, "not owner");
    listings[tokenId] = Listing(msg.sender, price, true);
    // optionally transfer to escrow or use approval
}

function buy(uint256 tokenId) external payable {
    Listing memory l = listings[tokenId];
    require(l.active && msg.value >= l.price, "invalid");
    listings[tokenId].active = false;
    // transfer NFT + pay seller (and royalty)
}
```

## Prefer Off-Chain Orders
For production marketplaces, use signed EIP-712 orders (Seaport-style) instead of pure on-chain order books to save gas and improve UX.
