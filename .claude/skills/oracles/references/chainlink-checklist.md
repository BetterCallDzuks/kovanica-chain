# Chainlink Integration Checklist

- [ ] Use the correct proxy / aggregator address for the target chain and pair
- [ ] Check `answer > 0`
- [ ] Check `updatedAt` against a maximum staleness (asset-dependent, often 1h or less for volatile pairs)
- [ ] Handle `roundId` / answeredInRound if using older patterns
- [ ] On L2s: integrate sequencer uptime feed + grace period after downtime
- [ ] Consider a secondary oracle or circuit breaker for large deviations
- [ ] Decimal handling: oracle decimals vs token decimals
- [ ] Test with mocked feeds that return stale / zero / extreme values
- [ ] Document the economic assumptions (max expected price move, etc.)
