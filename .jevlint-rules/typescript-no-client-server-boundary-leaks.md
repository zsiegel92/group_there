# TypeScript: keep server capabilities out of client modules

A client module imports or accesses a server-only capability.

---

Fail when a module marked `"use client"` imports or directly accesses
server-only capabilities such as the database, server authentication, private
environment variables, filesystem APIs, or secret-bearing service clients.
Public `NEXT_PUBLIC_` configuration and calls to an HTTP boundary pass. Also pass
server modules and client modules that receive already-safe serialized values.
