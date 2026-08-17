---
name: governance
description: On-chain governance patterns including Governor, TimelockController, vote delegation, proposal thresholds, and attack resistance. Use when designing or reviewing DAOs, token voting, parameter changes, or upgrade governance. Triggers include Governor, Timelock, DAO, proposal, vote, delegation, quorum, governance attack, OpenZeppelin Governor.
---

# Governance

## Overview

Design secure, usable on-chain governance with appropriate delays and checks against capture or griefing.

## Standard Stack

- OpenZeppelin Governor + TimelockController is the default production choice.
- ERC-20Votes or ERC-721Votes for voting power.
- Optional: GovernorCountingSimple, GovernorVotesQuorumFraction, GovernorTimelockControl.

## Critical Parameters

- **Voting delay** — time after proposal creation before voting starts
- **Voting period** — length of the voting window
- **Proposal threshold** — minimum votes to create a proposal
- **Quorum** — minimum participation for a proposal to succeed
- **Timelock delay** — minimum time between queue and execution

## Attack Surfaces

- Flash-loan governance attacks (borrow votes, vote, return in same block) — mitigated by snapshot or delay
- Low quorum + low threshold leading to easy capture
- Malicious proposals that drain treasury or change critical parameters
- Proposal spam / griefing
- Delegation centralization

## Best Practices

1. Always put critical actions behind a Timelock.
2. Use a non-trivial voting delay so the community can react.
3. Separate roles (proposer, executor, canceller) carefully.
4. Consider optimistic governance or off-chain signaling + on-chain execution for lower friction.
5. Document emergency powers and their constraints clearly.
6. Test proposal lifecycle end-to-end including queuing and execution.

## Residual Risk Note

On-chain governance can still be captured by large holders or cartels. Design with that reality in mind and provide clear exit or rage-quit paths where appropriate.

## Code Examples

See \`references/code-examples.md\` for concrete Solidity / Foundry snippets relevant to this skill.
