# kovanica-chain — OP Stack rollup engineering
#
# Stage 1 (local devnet) targets. Higher stages (Sepolia testnet, mainnet)
# are driven through the op-deployer workflow documented in
# docs/bootstrapping-fault-proof-op-stack-2026.md.

ENCLAVE ?= kovanica-devnet

.PHONY: help devnet-up devnet-down devnet-inspect devnet-logs

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) \
		| awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-16s\033[0m %s\n", $$1, $$2}'

devnet-up: ## Bring up the local Kurtosis devnet (fault proofs enabled)
	@scripts/devnet-up.sh

devnet-inspect: ## Inspect enclave health + download op-deployer artifacts
	@scripts/devnet-inspect.sh

devnet-logs: ## Follow the op-challenger logs
	@kurtosis service logs $(ENCLAVE) op-challenger-kovanica-challenger -f

devnet-down: ## Tear down the local devnet enclave
	@scripts/devnet-down.sh
