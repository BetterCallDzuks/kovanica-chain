# Cannon absolute prestates

The op-challenger serves prestate files from here (`cannon_prestates_path:
"static_files/prestates"` in `../../network_params.yaml`).

Drop the generated `<HASH>.json` and `<HASH>.bin.gz` here, where `<HASH>` is
the **Cannon64** absolute prestate hash for kovanica's genesis/rollup config —
the same value placed in `faultGameAbsolutePrestate`. See
[`../../README.md`](../../README.md) → "Stage 1b — the absolute prestate".

Prestate binaries are build artifacts and are `.gitignore`d — regenerate them
from the pinned `op-program` tag rather than committing them. This file and the
`.gitkeep` keep the directory present.
