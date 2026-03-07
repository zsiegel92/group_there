We want pairwise distances between locations, for attendees of an event to each other, and between them and the event's location, to be maintained as part of the application's state.

On `/events/[id]` we can edit the address of an event (if we are an admin) and can create/update our attendance address.

When an event's location or any of its attendees' locations are updated, the NextJS `after` function should be used to kick off a function that ensures all pairwise distances exist in the database.

`EventsPage` should use a hook that checks for the full distance matrix. It should show whether the distances all exist in the db and if they do it says they do, and if they don't all exist, it polls. If a user is an admin and the pairwise distances don't all exist, there should be a button for "re-attempt pairwise distance calculation" though by default the frontend should continue polling and show a spinner because the distances may actually land in the db at some point.

The schema in which the distance matrix is stored should be consistent with existing typescript functionality AND with the python service that is used for solutions.

We have `src/scripts/smoke-tests/test-google.ts` - we may have to add to that to test out something new in `src/lib/geo/service.ts`. That should be the first thing you do and you should run it with `pnpm run script src/scripts/smoke-tests/test-google.ts` (or another smoke test if necessary) and if you don't have the right scopes with our creds let me know and I'll look into it.
