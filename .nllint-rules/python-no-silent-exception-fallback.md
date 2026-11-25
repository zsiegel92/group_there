# Python: no silent exception fallback

An exception is hidden behind a fallback value that looks successful.

---

Fail when production code catches an exception and silently substitutes `None`,
an empty collection, a fabricated success value, or stale/default data in a way
that hides an operational failure. Pass when the exception is re-raised,
translated into a meaningful error, or deliberately handled with enough context
for callers or operators to distinguish fallback behavior from success. Test
fixtures may intentionally exercise or stub failures.
