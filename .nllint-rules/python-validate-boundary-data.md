# Python: validate data at trust boundaries

Dynamic external data is used without runtime validation.

---

Fail when dynamic external data from JSON, HTTP requests, environment variables,
database JSON, queues, or third-party services is used as trusted structured
application data without validation. Pydantic validation, an equivalent schema,
or explicit validation of the fields actually used passes. Merely annotating,
casting, or assuming the decoded value's type does not validate it.
