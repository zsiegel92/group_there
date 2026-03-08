On `/events/[id]` we can generate a solution and visualize it. But we can't persist it to the database or send out emails with instructions to participants.

We should do the following:

- the "generate solution" UI and map on which we see all attendees should only be visible to admins.

Non-admins in fact should not even see the full list of attendees! Only their own attendance along with a count of how many attendees there are.

Admins should have their view unchanged.

Also, when a solution has been generated, there should be a "Confirm Itinteraries" button that puts the event in a locked state.

Just like events can be scheduled or unscheduled, they can also be locked. We can add a new db enum or whatever.

There should be some UI on the right of `/events/[id]` that shows a progression from red (unscheduled) to yellow (scheduled) to green (itinterary confirmed) that ALL participants can see.

The admins who can confirm the itinerary can also "unlock" an event.

A locked event cannot be joined - members of the group can still see it but it needs a new badge to show it's locked and they can't join.

A locked event also doesn't let participants edit their attendance information.

The main change is we'll persist the solution to the db. If the solution has been persisted to the db, then when an admin visits the page, it should appear like it does now after they've clicked "Generate Solution" except it'll just be like that, and there's no "Generate Solution" button anymore.

Here's a tricky part. There is UI on /events/[id] seen be all (including admins) that shows THEIR assignment: when they should leave, what order they should drive to their stops or be picked up or whateve. And a map should show with ONLY their trip's participants and the destination. Participants who are NOT admins see this; admins see this in addition to the admin-only stuff.

---

To be clear, non-admin members should not see the map with all attendees' locations. It should either show just the event's location (if they haven't entered one yet), their location and the event location (if they have), or the full route of all the people they will travel with (if it is confirmed)

---

❌I think non-admin users can no longer insert or update their attendance on /events/[id]! This is a problem. They should for sure be able to.

---

I'm seeing "No feasible solution found" for an event I'm testing with which is super bad - why did that happen? It had feasible solutions before!

Also the "Unscheduled" -> "Scheduled" -> "Confirmed" event UI looks mega bad. There's a weird long line between unscheduled and scheduled.
