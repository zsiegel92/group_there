# Python: no blocking I/O in async code

Scope: Python `.py` and `.pyi` files only. Always pass other file types.

Fail when an `async` function directly performs clearly blocking work such as
`time.sleep`, synchronous HTTP requests, synchronous subprocess execution, or
ordinary blocking file/database I/O without moving it to a thread or using an
async API. Do not fail for CPU-only expressions, awaited calls, or calls whose
blocking behavior is not evident from this file.
