Look in the database with `npm run sqlc` commands. Find the "big" problem in there (we have at least one).

Write a typescript script that dumps it to disk as JSON in the shape that it usually sends to the python service. Import and re-use existing helpers for everything.

Write a Python script that loads it and solves it on Modal (not via web request to the FastAPI app, but just running it on Modal).

It should dump its output to disk as well.

Disk input/output of the problem should be in src/solver/tests/fixtures.

After you've run that script once write a test that loads the input with python, solves it the same way, but then checks that the output solution is exactly what we got before. We may have a test like that - maybe just add this as a test case.

This should be runnable with local python or on Modal (can add another Modal function for testing if needed). Look at the commands in package.json to see how we like to run python scripts/tests. Can add another script if needed but this last one will be part of the pytest suite.