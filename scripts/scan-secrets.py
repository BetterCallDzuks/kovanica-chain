#!/usr/bin/env python3
"""Precise secret scanner for the kovanica-chain repo.

Scans git-tracked text files for high-confidence secret leaks — the failure the
project already had a near-miss on (plaintext keys/mnemonics in cloud docs).
Deliberately conservative to stay green on legitimate content: it flags real
secret shapes (PEM private keys, a raw 64-hex key assigned to a key variable,
BIP39 mnemonics other than the public test fixture, AWS/GitHub/OpenAI tokens),
not every 0x-hex string (prestate hashes and addresses are fine).

Run: python scripts/scan-secrets.py   # exit 1 on any finding. Used by CI + `make check`.
"""
import re
import subprocess
import sys

# The well-known public Hardhat/Foundry/Anvil dev mnemonic — not a secret.
TEST_MNEMONIC = "test test test test test test test test test test test junk"

# Files that legitimately contain secret-shaped text (this scanner's own
# patterns; the env template's variable names).
ALLOWLIST_FILES = {"scripts/scan-secrets.py", ".env.example"}

PATTERNS = [
    ("PEM private key", re.compile(r"-----BEGIN (?:RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY-----")),
    # A raw 64-hex private key assigned to a key-like name via a literal (not env).
    ("hardcoded private key", re.compile(
        r"(?i)(?:private[_-]?key|privkey|secret[_-]?key)\s*[:=]\s*['\"]?0x?[0-9a-f]{64}\b")),
    # RPC/URL with embedded basic-auth credentials (SECURITY.md forbids these).
    ("credentialed URL", re.compile(r"[a-z][a-z0-9+.\-]*://[^\s/:@]+:[^\s/:@]+@")),
    # Engine-API JWT secret assigned to a jwt-ish name (bare 64-hex, no 0x — so
    # this does NOT match 0x-prefixed prestate hashes).
    ("engine JWT secret", re.compile(r"(?i)\bjwt(?:secret|_secret|token)?\b\s*[:=]\s*['\"]?(?:0x)?[0-9a-f]{64}\b")),
    ("AWS access key id", re.compile(r"\bAKIA[0-9A-Z]{16}\b")),
    ("GitHub token", re.compile(r"\bgh[pousr]_[A-Za-z0-9]{36,}\b")),
    ("Slack token", re.compile(r"\bxox[baprs]-[A-Za-z0-9-]{10,}\b")),
    ("OpenAI key", re.compile(r"\bsk-[A-Za-z0-9]{32,}\b")),
    ("Anthropic key", re.compile(r"\bsk-ant-[A-Za-z0-9-]{20,}\b")),
]

# 12- or 24-word all-lowercase quoted phrase (a BIP39 mnemonic shape).
MNEMONIC = re.compile(r"['\"]((?:[a-z]+ ){11,23}[a-z]+)['\"]")
# Same, but UNQUOTED after a `mnemonic:`/`mnemonic =` label — the shape a leaked
# doc line takes (the original near-miss was plaintext in a doc, not a string).
MNEMONIC_UNQUOTED = re.compile(r"(?i)\bmnemonic\b['\"]?\s*[:=]\s*((?:[a-z]+ ){11,23}[a-z]+)")


def tracked_files():
    out = subprocess.run(["git", "ls-files"], capture_output=True, text=True, check=True).stdout
    return [f for f in out.splitlines() if f]


def main() -> None:
    findings = []
    for path in tracked_files():
        if path in ALLOWLIST_FILES:
            continue
        try:
            with open(path, "r", encoding="utf-8") as fh:
                lines = fh.readlines()
        except (UnicodeDecodeError, FileNotFoundError, IsADirectoryError):
            continue  # binary or gone
        for n, line in enumerate(lines, 1):
            for label, pat in PATTERNS:
                if pat.search(line):
                    findings.append((path, n, label))
            for pat in (MNEMONIC, MNEMONIC_UNQUOTED):
                for m in pat.finditer(line):
                    phrase = m.group(1).strip()
                    words = phrase.split()
                    if len(words) in (12, 24) and phrase != TEST_MNEMONIC:
                        findings.append((path, n, "possible BIP39 mnemonic"))

    if findings:
        print("FAIL: potential secrets found:")
        for path, n, label in findings:
            print(f"  {path}:{n}: {label}")
        print("\nIf a match is a false positive, add the file to ALLOWLIST_FILES "
              "or move the value to an untracked .env / keystore.")
        sys.exit(1)
    print(f"OK: no secrets detected in {len(tracked_files())} tracked files")
    sys.exit(0)


if __name__ == "__main__":
    main()
