# Solver Refactor - COMPLETED ✓

## Summary

Successfully refactored the carpooling solver from brute-force to MILP-based approach, following the architecture from the poolchat reference implementation but with modern Python, full type safety, and Pyomo.

## What Was Done

### 1. Subset Enumeration Module (`groupthere_solver/subsets.py`)
- ✓ Implemented `SubsetEnumerator` class with lexicographic ordering
- ✓ Efficient n-choose-k combinations using combinatorial number system
- ✓ Bidirectional mapping: generate subset from index, get index from subset
- ✓ Full type annotations
- ✓ 11 comprehensive tests

### 2. Group Generator Module (`groupthere_solver/group_generator.py`)
- ✓ Pre-computes all feasible carpooling groups
- ✓ Respects capacity constraints (car_fits)
- ✓ Enforces must_drive constraints
- ✓ Checks willingness to ride
- ✓ Finds optimal pickup order via brute-force TSP for each group
- ✓ 8 comprehensive tests

### 3. MILP Solver Module (`groupthere_solver/milp.py`)
- ✓ Pyomo-based formulation
- ✓ Binary decision variables for group selection
- ✓ Constraint: each tripper in exactly one group
- ✓ Objective: minimize total drive time
- ✓ Uses GLPK solver
- ✓ 6 comprehensive tests

### 4. Main Solver (`groupthere_solver/solve.py`)
- ✓ Refactored from exhaustive partition search to MILP approach
- ✓ Three-phase architecture:
  1. Generate feasible groups
  2. Solve MILP assignment
  3. Convert to Solution format
- ✓ Maintains same API and models
- ✓ All existing tests still pass

### 5. Dependencies & Tooling
- ✓ Added Pyomo to pyproject.toml
- ✓ Installed GLPK solver via Homebrew
- ✓ All Python checks passing:
  - Type check: 0 errors
  - Lint: All checks passed
  - Format: 14 files formatted
  - Tests: 27 passing
  - Modal server: Deployed successfully

## Architecture Improvements

### Before (Brute Force)
```
Generate ALL partitions of trippers
  → For each partition:
      → For each subset in partition:
          → Try all drivers
          → Try all pickup orders
      → Select best partition
```
Complexity: Exponential in number of trippers (Bell number)

### After (MILP)
```
1. Generate feasible groups (with constraints)
   → For each group size k (1 to max_capacity):
       → For each k-subset of n trippers:
           → Check constraints (capacity, must_drive)
           → If feasible, find optimal pickup order

2. Solve MILP
   → Variables: x_i ∈ {0,1} for each feasible group
   → Minimize: Σ(drive_time_i * x_i)
   → Subject to: each tripper in exactly one group

3. Convert result to Solution format
```
Complexity: Much better - generates O(n^k) groups, then polynomial MILP solve

## Code Quality

- **Type Safety**: Full type annotations throughout, 0 pyright errors
- **Modern Python**: Uses Python 3.12+ features, clear variable names
- **Documentation**: Comprehensive docstrings for all public functions
- **Testing**: 27 tests covering edge cases (no drivers, capacity limits, must_drive conflicts, etc.)
- **Maintainability**: Clear separation of concerns, each module has single responsibility

## Files Created/Modified

### New Files
- `src/solver/groupthere_solver/subsets.py`
- `src/solver/groupthere_solver/group_generator.py`
- `src/solver/groupthere_solver/milp.py`
- `src/solver/tests/test_subsets.py`
- `src/solver/tests/test_group_generator.py`
- `src/solver/tests/test_milp.py`

### Modified Files
- `src/solver/groupthere_solver/solve.py` - Complete rewrite using MILP approach
- `src/solver/pyproject.toml` - Added pyomo dependency
- `src/solver/uv.lock` - Updated dependencies

## Next Steps (If Needed)

- Consider C implementation of TSP solver for pickup order optimization (mentioned in TODOs)
- Add time window constraints if needed in future
- Consider alternative MILP solvers (CBC, Gurobi) for larger problems
- Add performance benchmarking suite
