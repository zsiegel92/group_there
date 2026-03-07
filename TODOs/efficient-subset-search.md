We want need some way to search through subsets of riders/drivers and assign a "best" cost to that subset (taking into account who can drive, how many seats they have [for feasibility], and distances to destination).

This is a snippet of how we might get started:

```
In `../poolchat/src/groupThere` we have a full solution to the types of problems referenced in `src/solver/tests/test_solver.py`. It works roughly the following way:

- `subsets.py` is used to construct a bitarray in which each of the unique n choose k subsets of size k of n individuals gets a unique index, and the mapping between them is (somewhat) efficiently calculated. Not everything in there is strictly necessary for the app, but some of it makes writing a test suite much clearer. Let's re-implement in our repo something like that, but with modern python, everything statically typed, and ONLY the parts that are necessary for the groupthere app and maybe some tests that make it clear it's working. We need this when we loop over possible subsets before solving a MILP that assigns riders to cars - first, for each possible group of riders in a single car, we find the optimal drive time for that subset - starting from any driver and exhaustively going through every configuration. I think the app just brute force searches, but if there's a clear
-
```

We want:

- the algorithm for finding the shortest route from driver to all riders to destination, which is ultimately a traveling salesman problem, to continue to be brute force.
- we want it to be done in C with a clean python binding.
