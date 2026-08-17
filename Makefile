# kovanica-chain — OP Stack rollup engineering
#
# Stage 1 (local devnet) targets. Higher stages (Sepolia testnet, mainnet)
# are driven through the op-deployer workflow documented in
# docs/bootstrapping-fault-proof-op-stack-2026.md.

ENCLAVE ?= kovanica-devnet

.PHONY: help check devnet-up devnet-down devnet-inspect devnet-logs gen-prestate set-prestate

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) \
		| awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-16s\033[0m %s\n", $$1, $$2}'

check: ## Run all config validators, secret scan, and script syntax checks (mirrors CI)
	@echo ">> validate_network_params"      && python3 scripts/validate_network_params.py
	@echo ">> check-config-consistency"     && python3 scripts/check-config-consistency.py
	@echo ">> validate-sepolia-config (lint)" && python3 scripts/validate-sepolia-config.py
	@echo ">> scan-secrets"                  && python3 scripts/scan-secrets.py
	@echo ">> shell syntax"                  && for s in scripts/*.sh; do bash -n "$$s"; done && echo "  shell ok"
	@echo ">> e2e syntax"                    && node --check test/e2e/withdrawal-roundtrip/roundtrip.mjs && echo "  e2e ok"
	@echo ">> deploy-config JSON"            && for f in packages/contracts-bedrock/deploy-config/*.json; do python3 -c "import json,sys;json.load(open(sys.argv[1]))" "$$f"; done && echo "  json ok"
	@echo "All checks passed."

devnet-up: ## Bring up the local Kurtosis devnet (fault proofs enabled)
	@scripts/devnet-up.sh

devnet-inspect: ## Inspect enclave health + download op-deployer artifacts
	@scripts/devnet-inspect.sh

devnet-logs: ## Follow the op-challenger logs
	@kurtosis service logs $(ENCLAVE) op-challenger-kovanica-challenger -f

devnet-down: ## Tear down the local devnet enclave
	@scripts/devnet-down.sh

gen-prestate: ## Stage 1b: build kovanica's Cannon64 absolute prestate (needs Docker + MONOREPO_REF + genesis/rollup)
	@scripts/gen-prestate.sh

set-prestate: ## Wire a generated prestate hash into config: make set-prestate HASH=0x...
	@scripts/set-prestate.sh $(HASH)
