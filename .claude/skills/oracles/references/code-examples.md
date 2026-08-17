# Oracles — Code Examples

## Chainlink Price Feed with Checks
```solidity
import {AggregatorV3Interface} from "@chainlink/contracts/src/v0.8/shared/interfaces/AggregatorV3Interface.sol";

AggregatorV3Interface public immutable priceFeed;
uint256 public constant MAX_STALENESS = 1 hours;

error InvalidPrice();
error StalePrice();

constructor(address feed) {
    priceFeed = AggregatorV3Interface(feed);
}

function getPrice() public view returns (uint256) {
    (, int256 answer, , uint256 updatedAt, ) = priceFeed.latestRoundData();
    if (answer <= 0) revert InvalidPrice();
    if (block.timestamp - updatedAt > MAX_STALENESS) revert StalePrice();
    return uint256(answer);
}
```

## L2 Sequencer Uptime Check (OP Stack / Arbitrum style)
```solidity
AggregatorV3Interface public immutable sequencerUptimeFeed;
uint256 public constant GRACE_PERIOD = 1 hours;

error SequencerDown();
error GracePeriodNotOver();

function checkSequencer() internal view {
    (, int256 answer, uint256 startedAt, , ) = sequencerUptimeFeed.latestRoundData();
    // answer == 0 → sequencer is up
    if (answer != 0) revert SequencerDown();
    if (block.timestamp - startedAt < GRACE_PERIOD) revert GracePeriodNotOver();
}
```

## Simple Deviation Circuit Breaker
```solidity
uint256 public lastPrice;
uint256 public constant MAX_DEVIATION_BPS = 500; // 5%

function updateAndCheck(uint256 newPrice) internal {
    if (lastPrice > 0) {
        uint256 diff = newPrice > lastPrice ? newPrice - lastPrice : lastPrice - newPrice;
        if (diff * 10_000 / lastPrice > MAX_DEVIATION_BPS) revert PriceDeviation();
    }
    lastPrice = newPrice;
}
```
