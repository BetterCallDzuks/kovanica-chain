# Governance — Code Examples

## Minimal Governor Setup (conceptual)
```solidity
// Using OpenZeppelin Governor modules
import {Governor} from "@openzeppelin/contracts/governance/Governor.sol";
import {GovernorSettings} from "@openzeppelin/contracts/governance/extensions/GovernorSettings.sol";
import {GovernorCountingSimple} from "@openzeppelin/contracts/governance/extensions/GovernorCountingSimple.sol";
import {GovernorVotes} from "@openzeppelin/contracts/governance/extensions/GovernorVotes.sol";
import {GovernorVotesQuorumFraction} from "@openzeppelin/contracts/governance/extensions/GovernorVotesQuorumFraction.sol";
import {GovernorTimelockControl} from "@openzeppelin/contracts/governance/extensions/GovernorTimelockControl.sol";
import {TimelockController} from "@openzeppelin/contracts/governance/TimelockController.sol";
import {IVotes} from "@openzeppelin/contracts/governance/utils/IVotes.sol";

contract MyGovernor is
    Governor,
    GovernorSettings,
    GovernorCountingSimple,
    GovernorVotes,
    GovernorVotesQuorumFraction,
    GovernorTimelockControl
{
    constructor(IVotes token, TimelockController timelock)
        Governor("MyGovernor")
        GovernorSettings(
            1 days,   // voting delay
            1 weeks,  // voting period
            0         // proposal threshold
        )
        GovernorVotes(token)
        GovernorVotesQuorumFraction(4) // 4%
        GovernorTimelockControl(timelock)
    {}

    // required overrides ...
}
```

## TimelockController Roles
```solidity
// proposers can queue, executors can execute after delay
// admin can manage roles (should usually be the timelock itself or a multisig)
bytes32 public constant PROPOSER_ROLE = keccak256("PROPOSER_ROLE");
bytes32 public constant EXECUTOR_ROLE = keccak256("EXECUTOR_ROLE");
bytes32 public constant CANCELLER_ROLE = keccak256("CANCELLER_ROLE");
```

## Snapshot Protection Against Flash-Loan Votes
OpenZeppelin GovernorVotes uses checkpoints / snapshots so vote power is taken at proposal creation (or start), mitigating same-block flash-loan voting.
