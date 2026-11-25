# GROUPTHERE

A carpool optimization app for teams. Members input their origin location, vehicle availability, and departure flexibility. The app computes the optimal driver and passenger assignments to minimize total drive time for everyone getting to an event.

This is a partially-completed reboot of [poolchat](https://github.com/zsiegel92/poolchat), which was very outdated and poorly implemented but technically successful.

## Development

Install the Node dependencies, then bootstrap the unified local solver environment from [`src/solver/pyproject.toml`](/Users/zach/Dropbox/code/groupthere/src/solver/pyproject.toml):

```sh
pnpm install
pnpm run python-mojo:sync
source activate
```

There is no local `.venv` anymore. Solver tasks live in [`src/solver/pyproject.toml`](/Users/zach/Dropbox/code/groupthere/src/solver/pyproject.toml): use `pixi task list --manifest-path src/solver/pyproject.toml` to discover them, then run one with `pnpm run pr <task>`. `source activate` drops you into that same Pixi env.

## NLLint

The root `.nllintrc.jsonc` applies the six Markdown rules in `.nllint-rules/` to
handwritten Python, TypeScript, and TSX. The configuration keeps the
`jevlint` branch's rule scopes, thresholds, and severity levels. Git-ignored
files, generated clients, declarations, and build output are excluded.
The project ID in the gateway is `groupthere`.

From the NLLint checkout, run `make cli-install` to install the CLI and
`./ide-extension/install.sh` to install the VS Code extension. For a local
gateway, configure that checkout's `.env` and run `make daemon-start`, or use an
existing gateway. Sign in to the gateway, open **API keys**, and create a key
for Groupthere.

Put the connection details in `~/.config/nllint/config.json` so terminal and
VS Code sessions use the same gateway:

```json
{
  "gateway_base_url": "http://localhost:8080",
  "gateway_api_key": "nllint_..."
}
```

From the Groupthere root, run `nllint --dry-run` to see the selected paths,
`nllint` for a one-shot check, or `nllint watch --stream` for terminal watch.
The first lint pass requires a working Groupthere dependency setup. NLLint runs
the existing TypeScript and Python type and lint checks as a precondition.
The gateway receives the selected source files and rule text when linting.

In VS Code, open Groupthere as a trusted workspace. In **Extensions**, find
**NLLint** by `zsiegel92` and select **Enable (Workspace)** if it is disabled.
NLLint starts its own watcher. Use **NLLint: Restart Watchers** to restart it and
**NLLint: Show Output** to inspect startup or precondition errors.
