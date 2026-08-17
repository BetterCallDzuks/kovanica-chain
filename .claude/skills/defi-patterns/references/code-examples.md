# DeFi Patterns — Code Examples

## Minimal ERC-4626 Style Deposit/Withdraw
```solidity
// Simplified illustration — prefer OpenZeppelin ERC4626 for production
mapping(address => uint256) public shares;
uint256 public totalShares;
uint256 public totalAssets;

function deposit(uint256 assets) external returns (uint256 sharesOut) {
    uint256 supply = totalShares;
    sharesOut = supply == 0 ? assets : assets * supply / totalAssets;
    // inflation attack protection needed in real code (virtual offset)
    totalAssets += assets;
    totalShares += sharesOut;
    shares[msg.sender] += sharesOut;
    // transferFrom assets...
}

function redeem(uint256 sharesIn) external returns (uint256 assetsOut) {
    assetsOut = sharesIn * totalAssets / totalShares;
    shares[msg.sender] -= sharesIn;
    totalShares -= sharesIn;
    totalAssets -= assetsOut;
    // transfer assetsOut...
}
```

## Reward Accumulator (Staking)
```solidity
uint256 public rewardPerTokenStored;
uint256 public lastUpdateTime;
uint256 public rewardRate;
mapping(address => uint256) public userRewardPerTokenPaid;
mapping(address => uint256) public rewards;
mapping(address => uint256) public balanceOf;
uint256 public totalSupply;

function rewardPerToken() public view returns (uint256) {
    if (totalSupply == 0) return rewardPerTokenStored;
    return rewardPerTokenStored + (block.timestamp - lastUpdateTime) * rewardRate * 1e18 / totalSupply;
}

function earned(address account) public view returns (uint256) {
    return balanceOf[account] * (rewardPerToken() - userRewardPerTokenPaid[account]) / 1e18 + rewards[account];
}

modifier updateReward(address account) {
    rewardPerTokenStored = rewardPerToken();
    lastUpdateTime = block.timestamp;
    if (account != address(0)) {
        rewards[account] = earned(account);
        userRewardPerTokenPaid[account] = rewardPerTokenStored;
    }
    _;
}
```

## Simple Linear Vesting (Pull)
```solidity
struct Vest {
    uint128 total;
    uint128 claimed;
    uint64 start;
    uint64 duration;
}

mapping(address => Vest) public vests;

function claimable(address user) public view returns (uint256) {
    Vest memory v = vests[user];
    if (block.timestamp < v.start) return 0;
    uint256 elapsed = block.timestamp - v.start;
    if (elapsed >= v.duration) return v.total - v.claimed;
    return (uint256(v.total) * elapsed / v.duration) - v.claimed;
}

function claim() external {
    uint256 amount = claimable(msg.sender);
    vests[msg.sender].claimed += uint128(amount);
    // safeTransfer token
}
```
