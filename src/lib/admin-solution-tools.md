I want to add an admin-only feature to generate fake riders and calculate solutions, with some way to generate and test with arbitrarily many riders.

The one service I don't want to overload is the pairwise distance calculation, whose cost grows as n^2.

So I want to always save those distances in the db, but I don't want `src/db/schema.ts` to get super complicated.

Let's do the following:

- /event-admin/[id]/page.tsx; if not an admin, redirects to /events/[id]
- On /events/[id] there's a link to this if you're an admin

there should be tools to generate fake locations with a new locations.ownerType value called `'event_testing'` (add to `locationOwnerTypeValues`) and ownerId equal to the event's ID.

Generating these will have a few steps:

- select n
- choose a max radius (in miles)
- generate n random points roughly within that radius - if we have to pnpm add some library that can calculate lat/lon distances that's fine, choose the smallest possible one. if we can just write a single .ts file that does the kinds of calculations we need that's okay
- use reverse-geocoding (but not geocoding since we already have the lat/lon) to generation Location values to insert. We will first need new functionality in `src/lib/geo/service.ts` and new smoke-tests added to `smoke-test:google`. If there is no such google API or you need additional scopes on our google api creds, lmk and we'll work it out.
- There should be a full crud interface for these locations.
