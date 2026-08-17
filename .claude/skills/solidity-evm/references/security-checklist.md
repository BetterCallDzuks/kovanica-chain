# Pre-Deployment Security Checklist

## Access Control
- [ ] All privileged functions protected (onlyOwner / AccessControl / roles)
- [ ] Ownership uses Ownable2Step or equivalent two-step transfer
- [ ] No single-key god mode without documented rationale
- [ ] Timelock on critical upgrades and parameter changes

## Reentrancy & State
- [ ] Checks-Effects-Interactions pattern followed
- [ ] ReentrancyGuard on external value-transferring functions when needed
- [ ] No state changes after external calls unless intentional and guarded
- [ ] Read-only reentrancy considered for view functions used by others

## Tokens & ETH
- [ ] SafeERC20 used for all ERC-20 interactions
- [ ] Non-standard tokens (missing return, fee-on-transfer, rebasing) handled or explicitly rejected
- [ ] Pull-over-push for distributions
- [ ] ETH transfers use call{value:} with success check or limited gas
- [ ] No unchecked send or transfer

## Oracles & Pricing
- [ ] Price feeds have staleness checks and circuit breakers
- [ ] TWAP or multi-oracle used where single-point manipulation is possible
- [ ] Flash-loan attack surface minimized (same-block price usage avoided)

## Math & Precision
- [ ] No division before multiplication when precision matters
- [ ] Rounding direction documented and favorable to protocol where appropriate
- [ ] Overflow/underflow impossible or explicitly handled (Solidity 0.8+ checked)

## Upgradeability (if applicable)
- [ ] Storage layout compatible (no collisions)
- [ ] Initializer protected (disableInitializers in constructor)
- [ ] Upgrade authorization restricted and preferably time-locked
- [ ] Implementation not callable directly if it holds state

## Economic & DoS
- [ ] Griefing vectors (unbounded loops, forced ETH sends) mitigated
- [ ] Token approval race conditions considered
- [ ] Front-running / sandwich surfaces acknowledged or mitigated

## Documentation & Testing
- [ ] NatSpec complete for public interface
- [ ] Invariant tests cover core properties
- [ ] Fuzz tests on critical math paths
- [ ] Deployment scripts include verification and ownership checks
