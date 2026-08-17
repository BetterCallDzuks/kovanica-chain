# Security policy — kovanica-chain

kovanica-chain is an OP Stack rollup. A bug in the bridge/portal contracts,
derivation, or the fault-proof game is a bridge-of-funds or chain-halt bug —
treat every change in those paths as security-critical (see `CLAUDE.md` §3).

## Secret handling

**Never commit secrets.** Private keys, mnemonics, keystores, API tokens, and
RPC URLs with embedded credentials must never enter git, Notion, Drive, or any
shared doc.

- Real keys live only in an untracked `.env` (see `.env.example`) or a keystore.
- `.gitignore` blocks `.env*`, `*.pem`, `*keystore*`, and `.deployer/`
  (op-deployer state, which contains addresses and can reference keys).
- CI runs `scripts/scan-secrets.py` on every push, and `make check` runs it
  locally. It flags PEM keys, hardcoded private keys, BIP39 mnemonics (other
  than the public `test … junk` dev fixture), and common cloud tokens.
- If a secret is ever exposed — including in an external doc — treat it as
  **compromised**: rotate the key and move any funds immediately. Rotating is
  cheaper than assuming it wasn't scraped.

## Key custody (deployments)

- `ProxyAdmin` / `SystemConfig` owner and the `guardian` must be a timelocked
  multisig / SAFE for any network past a throwaway local devnet — never a
  deployer EOA. The guardian (pause, dispute-game blacklist, respected-game-type)
  must be distinct from the deployer.
- The Sepolia pre-flight gate (`scripts/validate-sepolia-config.py --deploy`)
  hard-fails on zero-address roles, `guardian == deployer`, a placeholder
  prestate, and — with `L1_RPC_URL` — owner roles that aren't contracts (SAFE).

## Reporting a vulnerability

Report suspected vulnerabilities privately to the maintainer rather than
opening a public issue. Do not include exploit details or any secret material
in a public channel.
