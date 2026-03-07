We have a service `src/solver/groupthere_solver/models.py` with some models related to locations.

We have a database schema without tables that specifically model locations `src/solver/groupthere_solver/models.py`

Edit the database schema so that `eventsToUsers` instead of just an originLocation string it uses an originLocationId that is a reference to some locations table.

- There should be some UI when editing or specifying attendance such that when we select "Where are you coming from", there are live Google location results that we can select from, and when we do, a (non-editable) card pops up with the full address. Not until an actual selection from the live search box is selected (and card rendered) can we join or update attendance
- Geocoding (getting lat/lon) may be possible just from the address search result but if there's a need to do another API call for that that's fine
- Locations don't really need to be deleted when users change their location; we can create a new one
- events should also have a `location_id` rather than just a
- Locations in the db can have `reference_type: 'user' | 'event'` and `reference_id: string`
- The python models can also be updated a bit if it's necessary/useful

As a very first step, you'll have to create a `src/lib/geo/` folder with a `schema.ts` and `client.ts` file at minimum (or something that reflects the needs of that module) and add some `tsx` scripts in `src/scripts/smoke-tests/` (to be executed with `pnpm run script <rel path>`) that do the API call(s) necessary to populate search results for the dropdown.

We can do this ourselves, we don't need to like import some premade google search result component. We can implement our own `useDebounce` hook or something, probably in `src/lib/utils.ts` idk. But using shadcn components is a must probably - don't want to reinvent the wheel.

At the end we'll want a single `<AddressSeelctorAndCard` React component with input params like `onNewValidatedLocation: (location: Location | null) => void` that we can use to snag the location, as well as `suggestedLocations: Location[]`, which if empty doesn't show anything but if passed in gives chips with suggested locations that sit in a little horizontally scrollable element under the search box (from which a dropdown drops with the API suggestions on debounced query change).

EVERYTHING should be strongly typed with zod - no type assertions, everything very type-aware throughout.

If you have to futz with database schemas (you will!) it's okay for some truncation(s) to happen but try to make sure users aren't truncated. It's okay for pretty much everything else to be. Note that `pnpm run sqlc` allows you to execute db commands in case `pnpm run db:migrate` doesn't do a surgical migration in a way that you know you can pull off with a few raw sql commands (e.g. copy to new column, delete old column, copy to other column, etc.) which you can feel free to do.
