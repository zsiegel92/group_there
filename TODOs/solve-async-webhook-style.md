`solve_async` in `src/solver/server.py` should take as INPUT a callback URL.

It should use `.spawn` with a Modal function that solves the problem and sends a webhook to the callback URL. Then it should return a ProblemReceivedResponse.

Right now it will need to 