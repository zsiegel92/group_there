# TypeScript: no floating asynchronous side effects

An asynchronous side effect is started without being observed or documented.

---

Fail when a clearly asynchronous side effect is started and its Promise is
neither awaited, returned, handled, nor explicitly discarded with `void` and a
documented reason. Examples include writes, notifications, scheduling, and
network mutations. Do not fail when this file does not provide enough evidence
that a call is asynchronous or effectful.
