# Avoid blocking I/O in async code

Blocking I/O inside an async function can stall the event loop.

---

Flag clearly blocking operations in an async function, such as Python
`time.sleep`, synchronous HTTP requests, or synchronous file or subprocess APIs
such as Node.js `readFileSync` and `execSync`. Pass when the operation uses an
async API or runs off the event loop. Require evidence in the file that the
operation blocks. CPU-only expressions are outside this rule's scope.
