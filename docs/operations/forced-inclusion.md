# Forced transaction inclusion (censorship resistance)

The core promise of a rollup: **a user can always get their L2 transaction
included, even if the sequencer refuses to.** On the OP Stack this works because
L2 derivation is deterministic from L1 data — deposits (including "forced"
transactions) are read from L1 and *must* be included by every honest verifier
in the L2 block that derives from that L1 block. The sequencer cannot skip them
without producing an invalid (non-derivable) chain.

## When you need this

- The sequencer is censoring your transaction (won't include it in an L2 block).
- The sequencer is offline but you still need to act on L2 (e.g. initiate a
  withdrawal, or interact with a contract) or move funds in.

## How it works

A deposit is created by calling `depositTransaction` on the L1 `OptimismPortal`.
This emits a `TransactionDeposited` event that op-node reads during derivation
and turns into a deposit transaction executed on L2 from your
aliased L1 address (for contract senders) or your address (for EOAs).

```solidity
// OptimismPortal (verify the signature against the deployed ABI / version)
function depositTransaction(
    address _to,
    uint256 _value,
    uint64  _gasLimit,
    bool    _isCreation,
    bytes   _data
) payable;
```

Example with `cast` (devnet / test values — never paste a real key; use a
keystore):

```bash
OPTIMISM_PORTAL=$(jq -r .OptimismPortalProxy ./devnet/out/state.json)

# Force an L2 call to <target> with <calldata>, funding <value> wei of gas on L2.
cast send "$OPTIMISM_PORTAL" \
  "depositTransaction(address,uint256,uint64,bool,bytes)" \
  <target> 0 200000 false <calldata> \
  --rpc-url "$L1_RPC_URL" --account <keystore>
```

The transaction lands on L2 after the L1 block containing your deposit is
derived by op-node (on a devnet, seconds; on mainnet, after the derivation
window). No sequencer cooperation is required.

## Notes & caveats

- **Deposits are guaranteed but not instant.** They execute in the L2 block
  derived from their L1 block, so inclusion latency is bounded by L1 confirmation
  + the derivation pipeline, not by the sequencer.
- **Address aliasing:** if the L1 sender is a contract, the L2 `msg.sender` is
  the *aliased* address (`L1 address + 0x1111000000000000000000000000000000001111`).
  Account for this when the forced call hits an access-controlled L2 contract.
- **Gas:** `_gasLimit` is the L2 gas for the deposited transaction; you pay for
  it via the deposit, not via L2 gas markets.
- **This is the censorship-resistance backstop for withdrawals too:** you can
  force-include the `initiateWithdrawal`/`L2ToL1MessagePasser` call from L1, so a
  malicious sequencer cannot trap your funds on L2. See
  [`sequencer-failure.md`](sequencer-failure.md).

## Verify before relying on it

- Confirm the deployed `OptimismPortal` `depositTransaction` signature and the
  current alias constant against the deployed ABI / the spec for your
  `op-contracts` version.
- Test the full forced-inclusion path on the devnet (deposit → appears on L2
  without the sequencer's help) as part of pre-testnet validation.
