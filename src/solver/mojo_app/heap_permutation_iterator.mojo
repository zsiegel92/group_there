"""Heap's algorithm permutation iterator for integer pointer buffers."""

from std.iter import StopIteration


struct HeapPermutationIterator:
    comptime Element = UnsafePointer[Int, MutExternalOrigin]

    var num_items: Int
    var perm: UnsafePointer[Int, MutExternalOrigin]
    var c: UnsafePointer[Int, MutExternalOrigin]
    var i: Int
    var yielded_initial: Bool

    def __init__(
        out self,
        items: UnsafePointer[Int, MutAnyOrigin],
        num_items: Int,
    ):
        self.num_items = num_items
        self.perm = alloc[Int](num_items)
        self.c = alloc[Int](num_items)
        self.i = 0
        self.yielded_initial = False

        for idx in range(num_items):
            self.perm[idx] = items[idx]
            self.c[idx] = 0

    def __del__(deinit self):
        self.perm.free()
        self.c.free()

    def __has_next__(self) -> Bool:
        return not (self.yielded_initial and self.i >= self.num_items)

    def __next__(mut self) raises StopIteration -> Self.Element:
        if not self.yielded_initial:
            self.yielded_initial = True
            return self.perm

        while self.i < self.num_items:
            if self.c[self.i] < self.i:
                if self.i % 2 == 0:
                    var tmp = self.perm[0]
                    self.perm[0] = self.perm[self.i]
                    self.perm[self.i] = tmp
                else:
                    var swap_idx = self.c[self.i]
                    var tmp = self.perm[swap_idx]
                    self.perm[swap_idx] = self.perm[self.i]
                    self.perm[self.i] = tmp

                self.c[self.i] += 1
                self.i = 0
                return self.perm

            self.c[self.i] = 0
            self.i += 1

        raise StopIteration()
