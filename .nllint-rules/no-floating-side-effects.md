# Observe asynchronous side effects

An asynchronous side effect is started without being observed or documented.

---

Flag clearly asynchronous writes, notifications, scheduling, and network
mutations when the resulting work goes unobserved. In TypeScript, awaiting,
returning, or handling the promise is sufficient. A deliberate `void` discard
with a documented reason also passes. In Python, flag a dropped coroutine or
task whose result or failure is never observed. Pass tasks tracked by a task
group or another lifecycle owner, and documented background tasks with explicit
failure handling. Require evidence in the file that the call is both
asynchronous and effectful.
