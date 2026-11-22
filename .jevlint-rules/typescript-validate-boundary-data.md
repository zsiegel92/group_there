# TypeScript: validate data at trust/network boundaries

Dynamic external data is used without runtime validation.

---

Fail when dynamic external data from `JSON.parse`, an HTTP response, storage, environment input, database JSON, or a message payload is used or returned as trusted structured application data without runtime validation. Zod parsing or equivalent explicit runtime validation passes. This often happens in a helper function - if a helper function is used, don't flag the call site; the internals of the helper function (before it returns), where an unvalidated response (e.g. `fetch`) is obtained, is the appropriate place to flag. Type annotations, generic type arguments, and assertions alone do not validate runtime data.
