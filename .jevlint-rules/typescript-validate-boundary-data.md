# TypeScript: validate data at trust boundaries

Scope: TypeScript `.ts` and `.tsx` files only. Always pass other file types.

Fail when dynamic external data from `JSON.parse`, an HTTP response, storage,
environment input, database JSON, or a message payload is used or returned as
trusted structured application data without runtime validation. Zod parsing or
equivalent explicit runtime validation passes. Type annotations, generic type
arguments, and assertions alone do not validate runtime data.
