---
description: Run a security audit pass on bridge/predeploy contracts
argument-hint: <path>
---

Run the `bridge-contract-audit` skill against $ARGUMENTS, then escalate
to the `chain-security-auditor` subagent for a deeper pass. Report
findings ranked by severity with an explicit go/no-go recommendation, per
the format in `.claude/agents/chain-security-auditor.md`.
