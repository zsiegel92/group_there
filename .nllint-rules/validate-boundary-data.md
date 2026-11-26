# Validate data at trust boundaries

Dynamic external data is used without runtime validation.

---

Flag code that uses or returns unvalidated external data as trusted structured
application data. Sources include decoded JSON, HTTP requests and responses,
environment variables, storage, database JSON, queues, and third-party services.
Pydantic, Zod, equivalent schemas, and explicit runtime checks of the fields
actually used are sufficient. Type annotations, generic type arguments, casts,
and assertions alone do not validate runtime data.

If a helper acquires the data, flag the missing validation inside the helper
before it returns, and pass callers that use its result. Pass helpers and
generated clients that validate data internally, and pass locally constructed
values whose types are established by static analysis. Honor comments that
explicitly indicate validation already occurred or should be ignored.
