The /groups/[id] page should show events for that group, just like it shows members! And they should be links to / events/[id] (obviously) and should show all the metadata (admin, joined, etc.) as we see on `/events`.

In fact, the EventsPage component is a client component - why don't we move it to `src/app/events/events-page.tsx` and import it in `src/app/events/page.tsx` and we can also import and use it in `/groups/[id]`.

We can add an optional arg to `src/app/api/events/route.ts` that takes a `groupId` and make it an optional arg to `EventsPage` (and drill it through `useEvents` etc., incorporating it into the query key) so that the events only for one group show.

And if a `groupId` is provided then maybe the outer group shaded-background area doen't need to render (since, presumably, we're already on a page just for one group).
