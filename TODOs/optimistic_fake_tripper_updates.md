On /events/[id] in the TestingEventDetailPage, we may have upwards of 20 (fake) trippers. Each has one to three UI elements visible to edit their info.

It's good that pressing a button makes the edit instantly (no "submit" necessary) but the form is slow.

Is there any React-idiomatic "optimistic" update mechanism we can use? I think there's a useOptimistic hook, and maybe react-query has some optimistic update helpers.

Idk but let's make it snappy.

Also there should be some UI indicating which tripper(s)' details are still only optimistically updated (vs round-trip from db updated).
