When we calculate distance matrices, we sometimes get errors like this:

```
1]  GET /api/events/event_0d20db85-91b1-40e0-aa72-28b2ea2fda4f/distances 200 in 108ms (compile: 4ms, render: 104ms)
[1] An error occurred in a function passed to `after()`: Error: Google Route Matrix API error: 400 [{
[1]   "error": {
[1]     "code": 400,
[1]     "message": "Request exceeded the maximum number of elements. The product of the number of origins and destinations must be \u003c= 625.",
[1]     "status": "INVALID_ARGUMENT"
[1]   }
[1] }
[1] ]
```

This means we can't do more than 25x25.

When the matrix is larger than 25x25, we have to iterate over 25x25 blocks.

It's okay to not do this in the least-possible-api-calls way, we can just do it in a naive way: slide a block across and the remainders in terms of height or width can just be smaller, and there may even be a super tiny remainder of both dimensions in the bottom. That's fine.

We have `pnpm run smoke-test:google` smoke test for these services in general, but let's make another standalone script that tests our service with a matrix of >25x25 to ensure it works. It can get its own pnpm command `pnpm run smoke-test:google-large-distmat` (so that we don't run this costly operation every time we smoketest our google services integrations).
