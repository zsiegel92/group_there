# `group_generator_mojo.mojo` Explained for Python Developers

This note explains the Mojo module [`group_generator_mojo.mojo`](/Users/zach/Dropbox/code/groupthere/src/solver/mojo_app/group_generator_mojo.mojo) assuming you already understand the Python implementation in [`group_generator.py`](/Users/zach/Dropbox/code/groupthere/src/solver/groupthere_solver/group_generator.py).

The shortest summary is:

- The algorithm is basically the same as the Python version.
- The big differences are about data representation, memory management, Python interop, and parallel execution.
- The code now has a cleaner boundary: Python marshalling at the edge, typed native business logic in the middle.
- Mojo in this file is being used much more like a systems language than like Python-with-types.

## Mental Model

If you read the Python version as:

1. enumerate candidate subsets
2. check each subset for feasibility
3. try each possible driver
4. find the best passenger pickup order
5. return Python objects

then the Mojo version does the same thing, but with these structural changes:

- Input Python lists are copied into raw contiguous arrays.
- Those native arrays are wrapped in a small owned input struct.
- Each subset is represented by an integer `work_idx`.
- A parallel worker reconstructs the subset from `work_idx`.
- Each worker writes its answer into a pre-allocated fixed-size result slot.
- Those result buffers are wrapped in a small owned output struct.
- Only after parallel work finishes does the code rebuild Python lists/tuples.

That design choice explains most of the "why does this look like C?" feeling in the file.

## What Mojo Is Doing Here

This module is not written in the most "high-level" style Mojo could support. It is deliberately written in a low-level, explicit style because it wants:

- predictable memory layout
- thread-safe read-only shared inputs
- no Python object manipulation inside parallel workers
- minimal allocation during the hot path

So when reading this file, it helps to think:

- top-level API surface: Python extension module
- inner loops: manually managed native code

## File Structure

The module has five main layers:

1. Python extension export
2. Python-to-native data unpacking
3. a typed native group-generation function
4. native-to-Python result packing
5. helper routines for route evaluation and subset unranking

## Key Mojo Semantics

## `comptime`

```mojo
comptime MAX_K = 6
comptime INTS_PER_SLOT = 3 + 2 * MAX_K
```

`comptime` means "known at compile time". Think of it like a constant that the compiler can use for layout decisions and optimization, not just a runtime variable.

In this file:

- `MAX_K` is an upper bound on group size
- `INTS_PER_SLOT` defines the fixed width of each result record

This matters because the code stores results in one flat pre-allocated integer array rather than in dynamically sized objects.

Python analogy: imagine deciding in advance that every result row is a fixed-size struct, even if some fields are only partially used.

## `@export` and `PyInit_*`

```mojo
@export
def PyInit_group_generator_mojo() -> PythonObject:
```

This is the Python extension module entrypoint. It is conceptually similar to the initialization function that a CPython native extension exports.

Inside it:

- `PythonModuleBuilder("group_generator_mojo")` creates a Python module object
- `m.def_function[...]("generate_feasible_groups_mojo", ...)` exposes a Mojo function as a Python-callable function
- `m.finalize()` returns the built Python module

The square-bracket syntax here is not a Python list or generic type parameter in the TypeScript sense. It is more like "bind this concrete function into the module builder API".

## `raises`

```mojo
def generate_feasible_groups_mojo(...) raises -> PythonObject:
```

`raises` means the function may throw an exception.

For a Python developer, the closest reading is:

- without `raises`, the function is declared as non-throwing
- with `raises`, it is allowed to propagate exceptions

This is more explicit than Python, where any function can raise.

## `PythonObject`

The public entrypoint still takes and returns `PythonObject` values:

```mojo
py_n: PythonObject
py_car_fits: PythonObject
...
```

This is the Python interop boundary. These values are opaque Python objects from Mojo's point of view until explicitly converted.

Examples:

```mojo
var n = Int(py=py_n)
car_fits[i] = Int(py=py_car_fits[i])
distance_to_dest[i] = Float64(py=py_distance_to_dest[i])
```

That is roughly:

- read a Python object
- convert it into a native Mojo value of the requested type

The inverse happens when constructing the return value with `Python.list()` and `Python.tuple(...)`.

The important refactor in the current file is that `PythonObject` is now confined to boundary helpers:

- `generate_feasible_groups_mojo(...)`
- `_unpack_python_inputs(...)`
- `_pack_generated_groups_py(...)`

The core algorithm itself now lives in `_generate_feasible_groups_native(...)`, which has typed native arguments and a typed native return value.

## `var`

```mojo
var n = Int(py=py_n)
```

`var` declares a mutable local variable.

Useful Python comparison:

- Python names are always rebinding-friendly references
- here `var` is closer to declaring a mutable local in a typed language

The type can be inferred from the initializer, or it can be stated explicitly elsewhere.

## Explicit native numeric types

You see types like:

- `Int`
- `Int64`
- `Float64`
- `Bool`

Unlike Python `int` and `float`, these are concrete native value types. In this file, that matters because:

- arrays need an exact element type
- pointer arithmetic depends on element type
- result-slot layout depends on integer width

`Int` is the normal native integer type used throughout the algorithm. `Int64` is used for the output slot array so the slot format is stable and wide enough for stored indices/flags.

## `alloc[...]` and manual `free()`

```mojo
var car_fits = alloc[Int](n)
...
car_fits.free()
```

This is raw manual allocation. Think `malloc` plus typed pointer semantics, not Python lists.

Important consequences:

- these buffers are not garbage collected Python objects
- you must free them yourself
- they are contiguous native memory
- indexing like `car_fits[i]` is pointer/array indexing

In this file, almost all hot-path data is stored this way:

- inputs
- temporary subset buffers
- driver/passenger working arrays
- result slots

That is one of the core performance differences from the Python implementation.

What changed in the refactor is ownership style:

- temporary scratch arrays are still manually freed inline
- longer-lived arrays are now grouped into small structs that free their buffers in `__del__`

So the code is still low-level, but the cleanup responsibility is more localized.

## Structs with owned native buffers

The file now defines two wrapper structs:

```mojo
struct NativeGroupGeneratorInputs:
    var n: Int
    var car_fits: UnsafePointer[Int, MutExternalOrigin]
    ...

    def __del__(deinit self):
        self.car_fits.free()
        ...
```

and:

```mojo
struct NativeGeneratedGroups:
    var total_work: Int
    var result_slots: UnsafePointer[Int64, MutExternalOrigin]
    var drive_times: UnsafePointer[Float64, MutExternalOrigin]

    def __del__(deinit self):
        self.result_slots.free()
        self.drive_times.free()
```

This is an important Mojo idiom in the refactored code:

- use a struct to make ownership explicit
- store raw pointers as fields
- use `MutExternalOrigin` for owned heap-backed pointer fields
- free those buffers in `__del__`

For a Python developer, the mental model is roughly:

- a tiny object whose job is to own native buffers
- with deterministic cleanup when the value is destroyed

That is much closer to RAII in C++ or a resource-owning struct in Rust than to Python GC-based cleanup.

## `UnsafePointer[...]`

Helper functions take parameters like:

```mojo
group: UnsafePointer[Int, MutAnyOrigin]
```

This means "a raw pointer to mutable `Int` data". The important part for a newcomer is the first word: `Unsafe`.

You should read this as:

- there is very little safety here
- bounds are not automatically enforced
- lifetime and aliasing discipline are the programmer's job

If Python lists are "safe containers", these are much closer to `int*` in C or a mutable raw slice backed by unmanaged memory.

`MutAnyOrigin` is part of the pointer origin/lifetime system. For understanding this file, the main point is just that the function accepts mutable pointers regardless of where they originated.

The refactored file now uses two different origin styles for two different roles:

- `MutExternalOrigin` on struct fields that own heap allocations
- `MutAnyOrigin` on helper-function parameters that should accept compatible mutable pointers from callers

That is a useful distinction:

- field types encode how the struct stores data
- helper signatures stay flexible about pointer provenance

## Pointer arithmetic

```mojo
var slot = result_slots + work_idx * INTS_PER_SLOT
```

This is true pointer arithmetic. `slot` points into the middle of the flat result buffer.

Later:

```mojo
slot[0] = 1
slot[1] = Int64(k)
slot[2] = Int64(best_driver_idx)
```

That is equivalent to writing fields into a manually packed record.

Python analogy:

- imagine one giant `array("q")`
- each work item owns a fixed slice
- code computes the slice start manually

## Why the result slot is fixed-width

Each slot stores:

- valid flag
- `k`
- chosen driver index
- up to `MAX_K` group member indices
- up to `MAX_K` passenger-order indices

So the code trades some wasted space for very simple parallel writes:

- each worker gets exactly one private output region
- no locks
- no append contention
- no resizing

That is a standard systems-style parallelization move.

## Closures: `@parameter` and `capturing`

```mojo
@parameter
def process_work_item(work_idx: Int) capturing:
```

This is one of the more unfamiliar parts if you come from Python.

What to take away:

- this defines a callable worker function used as a parameter to `parallelize`
- `capturing` means it closes over surrounding locals
- the worker uses outer variables such as `size_offsets`, `car_fits`, `result_slots`, and `drive_times`

You can think of it as "define an inline closure, then hand it to the parallel runtime".

The reason this is not just regular Python-style nested function sugar is that Mojo cares more explicitly about compile-time behavior, capture semantics, and native-code generation.

## Parallel execution

```mojo
parallelize[process_work_item](total_work)
```

This means: run `process_work_item` over the integer range `0..total_work`, in parallel.

The worker contract is intentionally simple:

- input: one integer work item index
- shared state: read-only input arrays and offset tables
- output: one dedicated result slot

The fixed-slot output design is what makes this parallel code easy to reason about.

There is no shared Python list append, no global best object, and no lock around result collection.

## The `^` on return

```mojo
return py_results^
```

This is a Mojo ownership/lifetime marker. For a Python-first explanation, the simplest useful reading is:

- "return this value as an owned result"

You do not need the full ownership model to understand this file, but you should notice that Mojo makes value movement and lifetime more explicit than Python does.

If something looks slightly unusual at a return site, it is often related to ownership rather than to the algorithm.

## Control flow is familiar

Most of the ordinary control flow is intentionally unsurprising:

- `for i in range(n):`
- `if ...:`
- `while i < num_passengers:`
- `break`
- `continue`

This part reads much more like Python than like Java or C++.

So the syntax jump is mostly not about loops and conditionals. It is about types, memory, and interop.

## Boundary split: interop vs business logic

One of the biggest readability improvements in the current file is that the top-level entrypoint is no longer doing everything.

It now follows this shape:

1. `generate_feasible_groups_mojo(...)` receives Python objects
2. `_unpack_python_inputs(...)` converts them into `NativeGroupGeneratorInputs`
3. `_generate_feasible_groups_native(...)` runs the actual algorithm
4. `_pack_generated_groups_py(...)` rebuilds Python lists/tuples

That separation is worth preserving. It keeps:

- Python interop code in one place
- native business logic in one place
- ownership of native buffers explicit in the intermediate structs

## Mapping the Mojo Entry Point to the Python Version

The public Mojo function corresponds roughly to `generate_feasible_groups(...)` in Python, but with a different API shape.

Python version:

- accepts `list[Tripper]`
- accepts a dictionary-based distance lookup
- returns `list[FeasibleGroup]`

Mojo version:

- accepts primitive Python lists and a flat matrix
- converts them into native arrays
- runs the algorithm in a typed native helper
- returns Python tuples/lists rather than `FeasibleGroup` objects

The Python bridge in [`mojo_group_generator.py`](/Users/zach/Dropbox/code/groupthere/src/solver/groupthere_solver/mojo_group_generator.py) does the translation.

That split is important:

- object-rich code stays in Python
- compute-heavy code stays in Mojo

## Why the Mojo API uses flat arrays instead of rich objects

The bridge precomputes:

- `car_fits: list[int]`
- `must_drive: list[bool]`
- `distance_to_dest: list[float]`
- `dist_matrix: list[float]` in row-major order

This is not just stylistic. It avoids:

- repeated Python attribute access inside hot loops
- Python dict lookup during route evaluation
- Python object traffic across threads

The most direct comparison is:

- Python `distance_lookup[(a, b)]`
- Mojo `dist_matrix[i * n + j]`

The second is much uglier but much cheaper.

## Subset enumeration: different mechanism, same idea

In Python, subset generation comes from `SubsetEnumerator().iter_subsets(n, group_size)`.

In Mojo, the code does not keep a subset iterator object. Instead it:

1. computes how many subsets exist for each `k`
2. assigns each subset a global `work_idx`
3. uses `_unrank_combination(n, k, subset_idx, group)` to reconstruct the actual subset

This is a better fit for parallelization because:

- each work item is independently addressable
- workers do not need to coordinate through a shared iterator

This is one of the main algorithm-structure changes between the implementations.

## `_generate_feasible_groups_native`: the actual business logic

This function is now the cleanest "core logic" entrypoint in the module:

```mojo
def _generate_feasible_groups_native(
    n: Int,
    car_fits: UnsafePointer[Int, MutAnyOrigin],
    must_drive_flags: UnsafePointer[Bool, MutAnyOrigin],
    distance_to_dest: UnsafePointer[Float64, MutAnyOrigin],
    dist_matrix: UnsafePointer[Float64, MutAnyOrigin],
) -> NativeGeneratedGroups:
```

That signature is useful because it says exactly what the algorithm needs:

- one scalar size
- four native read buffers
- one native result value

No `PythonObject` values appear in the business-logic signature anymore.

## `_check_group_into_slot`: Python `best_group` logic without objects

This helper is the native equivalent of the core feasibility logic in Python.

It performs the same conceptual steps:

1. count `must_drive`
2. build candidate drivers
3. enforce must-drive rules
4. test each candidate driver's capacity and ride willingness constraints
5. compute best pickup order
6. store the winning configuration

The major style difference is that it does not build rich objects on the way.

Instead it keeps:

- integer counters
- raw working arrays
- a best-so-far scalar and best-so-far output buffer

This is a recurring Mojo pattern in performance-sensitive code.

## Route optimization: Python permutations vs Heap's algorithm

Python uses:

```python
for perm in permutations(passengers):
```

Mojo uses `_best_pickup_order_unsafe(...)`, which:

- copies passengers into a mutable working permutation buffer
- uses Heap's algorithm to generate permutations in place
- evaluates each permutation with `_eval_route(...)`
- copies the best permutation into `best_order_out`

This is still factorial work, just without allocating Python tuples for each permutation.

That distinction matters:

- algorithmically: same complexity class
- operationally: far less object churn

## `_eval_route` is the easiest function to read

```mojo
var current = driver_idx
for i in range(num_passengers):
    var next_stop = perm[i]
    drive_time += dist_matrix[current * n + next_stop]
    current = next_stop
drive_time += distance_to_dest[current]
```

This is almost a line-for-line native version of the Python route evaluation logic.

If the file starts to feel dense, this function is a good anchor: the algorithm itself is not exotic. Most complexity comes from the representation choices around it.

## Why there are so many temporary arrays

Examples:

- `group`
- `group_drivers`
- `best_passenger_order`
- `candidate_passenger_order`
- `passengers`
- `perm`
- `c`

For a Python developer, some of these may look like they should just be lists. They are arrays because:

- native arrays are cheaper to mutate
- they can be passed as raw pointers
- they avoid Python allocation and GC overhead
- they are easier to use inside parallel native code

The tradeoff is verbosity and manual cleanup.

## Safety and lifetime assumptions

This module relies on a few important assumptions:

- `MAX_K` really is a valid upper bound for all possible groups
- every allocated buffer is eventually freed
- helper functions do not write beyond allocated bounds
- parallel workers only write to their own slot and drive-time cell

Python would protect you from many mistakes here. Mojo, in this style, will not.

So when reading or modifying code like this, think more like:

- "is this logically correct?"
- and also "is this memory-layout correct?"

## A few syntax details that are easy to misread

### Type conversion calls

```mojo
Int(py=py_car_fits[i])
Float64(py=py_distance_to_dest[i])
```

This is explicit conversion from Python object to native type.

### No `None`

This file mostly uses sentinel values instead of optionals:

- `best_driver_idx = -1`
- `best_drive_time = Float64(1e18)`

That is a common low-level pattern.

### Boolean names are normal values

```mojo
var found = False
var can_all_ride = True
```

Nothing special here; these behave as you would expect.

## `__del__` and deterministic cleanup

```mojo
def __del__(deinit self):
    self.result_slots.free()
    self.drive_times.free()
```

`__del__` here is not Python-style "maybe the GC calls this eventually". In this file it is being used as deterministic native cleanup for owned resources.

The most useful beginner reading is:

- if a struct owns a raw allocation, `__del__` is where cleanup belongs

That makes the refactored code easier to maintain because the buffer-freeing logic for long-lived values is attached to the type that owns the buffers.

## How to read this file efficiently

A good reading order is:

1. [`generate_feasible_groups_mojo`](/Users/zach/Dropbox/code/groupthere/src/solver/mojo_app/group_generator_mojo.mojo)
2. `NativeGroupGeneratorInputs`
3. `NativeGeneratedGroups`
4. `_unpack_python_inputs`
5. `_generate_feasible_groups_native`
6. `_pack_generated_groups_py`
7. `_check_group_into_slot`
8. `_best_pickup_order_unsafe`
9. `_eval_route`
10. `_unrank_combination`

If you do that, the file becomes:

- entrypoint and marshalling
- owned native data containers
- typed native algorithm
- Python repacking
- group feasibility
- route optimization
- subset reconstruction

instead of one long block of unfamiliar syntax.

## Direct Python-to-Mojo translation table

| Python concept | This Mojo file |
|---|---|
| `list[int]` | `alloc[Int](n)` plus manual `free()` |
| `dict[(i, j)] -> float` | flat `Float64` matrix with `i * n + j` indexing |
| generator/iterator over subsets | integer `work_idx` plus `_unrank_combination(...)` |
| dataclass/object holding native resources | struct with pointer fields and `__del__` |
| build result objects incrementally | write into pre-allocated fixed slots |
| `itertools.permutations` | Heap's algorithm over mutable arrays |
| Python object return values | explicit `Python.list()` / `Python.tuple(...)` construction |
| implicit exceptions | `raises` declared in signature |
| one-threaded loop | `parallelize[...]` worker execution |

## What is Mojo-specific here vs just low-level programming?

Some things are specifically Mojo:

- `@export`
- `PythonModuleBuilder`
- `PythonObject`
- `raises`
- `MutExternalOrigin`
- `@parameter`
- `capturing`
- `__del__(deinit self)`
- return ownership syntax like `^`

Some things are not uniquely Mojo so much as "native systems programming written in Mojo":

- raw pointers
- manual allocation
- fixed-size slot packing
- row-major flat arrays
- sentinel-based control flow
- explicit parallel work partitioning

That distinction is useful because if you feel friction reading this file, the hard part is often the low-level style, not the basic language syntax.

## Bottom line

If you already understand the Python implementation, the Mojo module is best read as:

"the same feasible-group search, rewritten so the expensive inner loops operate on native arrays and can be parallelized without touching Python objects."

The main new things to learn are not the business rules. They are:

- where Mojo makes types explicit
- where Mojo makes ownership/lifetime explicit
- where the code has dropped into raw-pointer style for performance
- how the Python/native boundary is intentionally narrow

Once that clicks, the file becomes much less mysterious.
