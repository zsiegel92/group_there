# Project Description

This is a revamp of GROUPTHERE, an application in which users join teams, join team-wide events, and input:
- their origin location
- whether they have a car, how many seats they have to share if so
- how early before the event start time they can leave
- if they have a car, whether they HAVE to drive or are open to riding

and the app solves the total drive-time-minimizing solution for drivers to pick up riders and make it to the event.

Read src/solver/models.py for the scaffolding.

The core setup will be a Python service that does the optimization, we will use Nvidia's CuOpt library, and a NextJS application for the UI.

# Python guidelines

- Always activate the venv with `./activate` before running Python and uv commands
- Always type-check and lint Python code with:
```sh
uv run --directory src/solver ty check
uv run --directory src/solver ruff check
uv run --directory src/solver ruff format --check
# actually change files in-place
uv run --directory src/solver ruff format
```

Everything in my IDE should be type-aware, but don't add extra type annotations where the type can be inferred. Sometimes return types are appropriate, sometimes inferring it is best - use taste!


# Typescript guidelines

- NEVER use type assertions (`as X`)
- Do not annotate with explicit `any` - `unknown` can be okay for a super brief pre-validation state, but otherwise we should use `zod` to validate as soon as possible
- type guards can be lies too - don't do that!
- use `satisfies X` after something to keep types consistent when necessary