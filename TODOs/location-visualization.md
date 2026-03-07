Let's add `react-map-gl` and on `/events/[id]` we can see a visualization of all the locations attending the event in an embedded map.

Keep the code really well modularized.

---

The "Locations" UI should be below the attendees and "distances computed" UI.

The "Solutions" UI should actually be combined with the "Locations" UI - the "Generate solution" button should be on the same grey background part as the map!

And the states should be combined in some way so that it is easy enough for the data from the generated solution to be stored in state and persisted onto the map to show the routes taken by the individuals.

If we need to use like the google maps routes api that's fine, we can

Let's also use [the computeRoutes API](https://developers.google.com/maps/documentation/routes/reference/rest/v2/TopLevel/computeRoutes) and store those on the locationDistances table in json format with .$type, using an inferred shape from a zod schema that validates the incoming data. We should have a smoke test for that API interaction as well, which you should run and confirm it works asexpected. Only add this if the mapbox map doesn't have a built-in API to show routes with waypoints based on origin, waypoints, and destinations only. If it doesn't then yeah let's use Google to get the route and include that in our map.

---

Keep the matrix call. Add a db column for the pairwise polyline. Don't load all of those when we calculate the distances, but when we calculate an optimal solution, look at the implied routes and lazy-load the polylines for the necessary pairs. There should be an API route that takes in some kind of solution/assignment, looks in the db for the pairwise routes involved, and lazy-loads them.

We can `pnpm add p-queue` and `p-retry` and the API route should have at the very top ALL_CAPS_CONSTS defining the rate limiting behavior we're using to backfill/lazy load those routes. Then it should get them.

If we already have a route that loads pairwise distances maybe we can just add a param to include or exclude polylines from the json column, and in the case where it's expected to get them, it gives polylines or null, then the function checks which ones we need and don't yet have and calls out to the function that snags them (with p-queue) and then writes them to the db and returns them.

The current behavior of the app shouldn't be affected/slowed down in any case, this should only be what's done if/when we get a solution in which case the map will be updated with the polylines.
