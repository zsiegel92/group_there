Throughout the app, we use some native browser alert() and confirm(). We also I think have a dialog component in a few places. I want the following:
- NEVER use the built-in browser alert/confirm/etc.
- always use our custom dialog but it needs some work:


our custom dialog should get the following upgrades:
- escape is equivalent to cancel/exit
- enter does the default, which I guess is usually like "okay" or "confirm"
- it should be browser accessible with keyboard such that tab goes between the two options and spacebar can click them. This shouldn't take like keyboard-handling I think it should just kind of be that way if we focus the right thing and build it right.