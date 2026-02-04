"""
Efficient enumeration of subsets.

This module provides utilities for working with combinatorial subsets,
particularly n-choose-k combinations. It supports both generating the i-th
subset and finding the index of a given subset.
"""

from functools import lru_cache


class SubsetEnumerator:
    """
    Enumerates and indexes subsets efficiently using combinatorial number system.

    The combinatorial number system provides a bijection between k-element subsets
    of {0, 1, ..., n-1} and integers in the range [0, C(n,k)).

    Example:
        >>> enum = SubsetEnumerator()
        >>> enum.generate_subset(5, 3, 0)  # First 3-subset of 5 elements
        [0, 1, 2]
        >>> enum.generate_subset(5, 3, 9)  # Last 3-subset of 5 elements
        [2, 3, 4]
        >>> enum.subset_index([0, 1, 2])   # Index of subset [0, 1, 2]
        0
    """

    @lru_cache(maxsize=10000)
    def binomial(self, n: int, k: int) -> int:
        """
        Calculate binomial coefficient C(n, k) = n! / (k! * (n-k)!).

        Uses dynamic programming with memoization for efficiency.

        Args:
            n: Total number of items
            k: Number of items to choose

        Returns:
            The binomial coefficient C(n, k)
        """
        if k > n:
            return 0
        if k < 0:
            return 0
        if k == 0 or k == n:
            return 1
        if k == 1:
            return n

        k = min(k, n - k)
        return self.binomial(n - 1, k) + self.binomial(n - 1, k - 1)

    def generate_subset(self, n: int, k: int, index: int) -> list[int]:
        """
        Generate the index-th k-subset of {0, 1, ..., n-1} in lexicographic order.

        Lexicographic order enumerates subsets by: {0,1}, {0,2}, ..., {0,n-1},
        then {1,2}, {1,3}, ..., etc.

        Args:
            n: Total number of elements
            k: Size of the subset
            index: Index of the subset (0-based)

        Returns:
            A sorted list of k integers representing the subset

        Example:
            >>> enum = SubsetEnumerator()
            >>> enum.generate_subset(5, 3, 0)
            [0, 1, 2]
            >>> enum.generate_subset(5, 3, 1)
            [0, 1, 3]
        """
        if k == 0:
            return []
        if k > n:
            raise ValueError(f"Cannot choose {k} elements from {n} elements")
        if index >= self.binomial(n, k):
            raise ValueError(f"Index {index} out of range for C({n},{k})")

        result = []
        offset = 0
        remaining = index

        # Build subset in lexicographic order
        for pos in range(k):
            # Find the first element for this position
            # Count how many subsets have first element at offset, offset+1, etc.
            while offset < n:
                # How many k-subsets starting at 'offset' come before us?
                count = self.binomial(n - offset - 1, k - pos - 1)
                if remaining < count:
                    # This is the right position
                    result.append(offset)
                    offset += 1
                    break
                else:
                    # Skip all subsets starting at this offset
                    remaining -= count
                    offset += 1

        return result

    def subset_index(self, n: int, subset: list[int]) -> int:
        """
        Find the index of a given subset in the lexicographic enumeration.

        This is the inverse operation of generate_subset.

        Args:
            n: Total number of elements
            subset: A sorted list of unique integers from {0, 1, ..., n-1}

        Returns:
            The index of this subset in the enumeration

        Example:
            >>> enum = SubsetEnumerator()
            >>> enum.subset_index(5, [0, 1, 2])
            0
            >>> enum.subset_index(5, [0, 1, 3])
            1
        """
        if not subset:
            return 0

        sorted_subset = sorted(set(subset))
        k = len(sorted_subset)
        index = 0
        offset = 0

        for pos, element in enumerate(sorted_subset):
            # Count subsets that come before this one
            # All subsets with position 'pos' having values from offset to element-1
            for val in range(offset, element):
                index += self.binomial(n - val - 1, k - pos - 1)
            offset = element + 1

        return index

    def iter_subsets(self, n: int, k: int):
        """
        Iterate over all k-subsets of {0, 1, ..., n-1}.

        Args:
            n: Total number of elements
            k: Size of each subset

        Yields:
            Each k-subset as a sorted list of integers

        Example:
            >>> enum = SubsetEnumerator()
            >>> list(enum.iter_subsets(4, 2))
            [[0, 1], [0, 2], [0, 3], [1, 2], [1, 3], [2, 3]]
        """
        count = self.binomial(n, k)
        for i in range(count):
            yield self.generate_subset(n, k, i)
