# Surface failures when falling back

An exception is hidden behind a fallback value that looks successful.

---

Flag production code that catches an exception or handles a rejected promise
and silently substitutes a null value, an empty collection, a fabricated success
value, or stale/default data in a way that hides an operational failure. Pass
when the failure is propagated, translated into a meaningful error, or handled
with enough context for callers or operators to distinguish fallback behavior
from success. Test fixtures may intentionally exercise or stub failures.
