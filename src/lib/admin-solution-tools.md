I want to add an admin-only feature to generate fake riders and calculate solutions, with some way to generate and test with arbitrarily many riders.

The one service I don't want to overload is the pairwise distance calculation, whose cost grows as n^2.

So I want to always save those distances in the db, but I don't want `src/db/schema.ts` to get super complicated.

Let's do the following:

- add a new column to `groups` called `type` with values `'social' | 'testing'` (use an enum)
- On creation of each user, there should be a testing group created for them called `'Testing Playground'`
- On `/groups` it should be clear that a group is for testing
- On `/events`, that group should be at the bottom, below everything
- On `src/app/events/[id]/page.tsx`, implement the logic around figuring out what kind of event it is. If it's an admin testing event (from the user's admin testing group) then show a completely different event UI, from a `testing-event-details.page.tsx` file.
- If anything in `src/app/events/[id]/social-event-details-page.tsx` should be moved to a separate file and exported so that it can be re-used for this that's gret
- On an admin page, we don't have users from the group in the typical sense. There is only one user in the admin group. BUT there can still be `eventsToUsers` rows. And `locations` corresponding to those events-to-users.
- There should be a full crud interface for these fake users (eventsToUsers) rows and their locations, all on this page.

there should be tools to generate fake locations for the user origins.

Generating these will have a few steps:

- select n
- choose a max radius (in miles)
- generate n random points roughly within that radius - if we have to pnpm add some library that can calculate lat/lon distances that's fine, choose the smallest possible one. if we can just write a single .ts file that does the kinds of calculations we need that's okay
- use reverse-geocoding (but not geocoding since we already have the lat/lon) to generation Location values to insert. We will first need new functionality in `src/lib/geo/service.ts` and new smoke-tests added to `smoke-test:google`. If there is no such google API or you need additional scopes on our google api creds, lmk and we'll work it out.
- add them to the event with their locations
- Each user should have a minimal UI to quickly edit their attendance form excluding origin location - whether they can/have to drive, number seats, earliest they can leave (can simplify to ONLY selecting from the available chips - 15, 30, 45, 1hr, 1hr15, 1h430, 2hr)
- should be really easy to modify them all, ideally with keyboard (without setting up explicit keyboard handlers - just like tab and spacebar and maybe sometimes arrows should do it - just make it normal)
- It should render on the map as before. I'd prefer to extend our existing map UI stuff than totally rewriting it for this, or at least a good mix of re-using bits and pieces (maybe adding exports, moving some things to their own files, etc.)

- these testing events are alwaqys "Scheduled" or "Confirmed" (not unscheduled)
- there are no blast utils of course (no emails to these fake users)
- ideally we reuse as much of the "Generate solution" UI and API routes etc but don't make things too complicated.

There should be additional UI on the page that shows metrics, like "total drive time if everyone drives themselves" (to compare to the optimal found solution). Put this in its own module and set it up in such a way that if we wanted to add that part to the regular `src/app/events/[id]/social-event-details-page.tsx` page we can.

We should of course see the `eventsToUsers` locations on the map even before we generate a solution. Once we generate a solution, just like on the existing /events/[id] page, we should see the routes etc.

Basically, we should be able to automatically generate and modify a scenario easily, generate solutions, see the solution in UI, see it on the map, and see metrics about the advantage yielded by that solution.

Go!
