# Contributing to kovanica-chain

kovanica-chain is an OP Stack rollup. Read `CLAUDE.md` (the engineering charter)
and `SECURITY.md` before your first change. Two disciplines, treated with equal
rigor: Go node-stack engineering and Solidity/Foundry contract engineering.

## Ground rules

- **State the network stage** of every change explicitly: local devnet /
  Sepolia testnet / mainnet. The bar differs enormously between them.
- **Never guess OP Stack semantics.** The spec (https://specs.optimism.io) and
  the `ethereum-optimism/optimism` monorepo at the pinned `op-contracts` tag are
  the source of truth for derivation rules, contract interfaces, and predeploy
  addresses.
- **Never commit secrets.** Keys live only in an untracked `.env` or a keystore
  (`SECURITY.md`). CI runs a secret scan.
- **Don't skip stages.** devnet → Sepolia → mainnet, for anything touching
  contracts, derivation, or genesis.

## Local checks

Run the full local gate before pushing — it mirrors CI:

```bash
make check
```

Install the git hook so it runs automatically on every push (bypass with
`git push --no-verify`):

```bash
make install-hooks
```

For the contracts package (needs Foundry):

```bash
cd packages/contracts-bedrock
forge fmt --check && forge build --sizes && forge test -vvv
```

For the e2e acceptance-test unit tests (needs Node ≥ 22):

```bash
cd test/e2e/withdrawal-roundtrip && npm ci && npm run test:unit
```

## Pull requests

- Branch from `main`; open a PR using the template. Fill in the network stage
  and the consensus/bridge/fault-proof impact checklist honestly.
- Keep PRs focused. CI must be green.
- Changes to `OptimismPortal`, the bridge/predeploys, op-node derivation, or the
  fault-proof game require a `chain-security-auditor` pass before any real-value
  deployment, and owner review per `CODEOWNERS`.

## Config discipline

`devnet/network_params.yaml` and `packages/contracts-bedrock/deploy-config/*.json`
must agree — `scripts/check-config-consistency.py` enforces it. Never hand-edit
`genesis.json`/`rollup.json`; regenerate them from the deployment
(`op-deployer inspect`). Regenerate the Cannon prestate whenever the contracts
tag or chain config changes.
