# GROUPTHERE

A carpool optimization app for teams. Members input their origin location, vehicle availability, and departure flexibility. The app computes the optimal driver and passenger assignments to minimize total drive time for everyone getting to an event.

This is a partially-completed reboot of [poolchat](https://github.com/zsiegel92/poolchat), which was very outdated and poorly implemented but technically successful.

## Development

Install the Node dependencies, then bootstrap the unified local solver environment from [`src/solver/pyproject.toml`](/Users/zach/Dropbox/code/groupthere/src/solver/pyproject.toml):

```sh
pnpm install
pnpm run mojo:install
source activate
```

After that, the solver-related `package.json` scripts run through Pixi against the shared solver manifest.
