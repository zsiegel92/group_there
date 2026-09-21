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

## JevLint

The root `.jevlintrc.toml` covers handwritten Python, TypeScript, and TSX while
excluding generated clients and build output. Its rule sets apply Python rules
only to Python files and TypeScript rules only to TypeScript and TSX. Each
`[[rule_sets]]` block defines its file globs and maps rule IDs directly to
`error` or `warning`; files matching no rule set are ignored. The top-level
`exclude` list removes shared generated and build paths.

Each rule's user-facing diagnostic message is the Markdown before its `---`
separator. The full Markdown, including the detailed instructions after that
separator, is sent to Jev. Editing a rule triggers a cached project-wide pass;
ordinary source edits analyze and replace diagnostics for only the affected
file. The configured 400 ms debounce coalesces editor save events.

Before making Jev requests, each pass requires the existing TypeScript typecheck
and ESLint checks plus Python Pyright and Ruff checks to succeed. Run a one-off
check with `jevlint`, or install the JevLint VS Code extension and reload the
window to use its automatically managed watch process. Put the raw TypeSafe key
in `~/.config/jevlint/typesafe-api-key`; the watcher rereads it on every pass,
so updating the key does not require restarting VS Code.
