"""Tests for subset enumeration."""

from groupthere_solver.subsets import SubsetEnumerator


def test_binomial_basic():
    """Test basic binomial coefficient calculations."""
    enum = SubsetEnumerator()

    assert enum.binomial(5, 0) == 1
    assert enum.binomial(5, 1) == 5
    assert enum.binomial(5, 2) == 10
    assert enum.binomial(5, 3) == 10
    assert enum.binomial(5, 4) == 5
    assert enum.binomial(5, 5) == 1
    assert enum.binomial(5, 6) == 0


def test_generate_subset_basic():
    """Test generating basic subsets."""
    enum = SubsetEnumerator()

    # Generate all 2-subsets of {0, 1, 2, 3}
    assert enum.generate_subset(4, 2, 0) == [0, 1]
    assert enum.generate_subset(4, 2, 1) == [0, 2]
    assert enum.generate_subset(4, 2, 2) == [0, 3]
    assert enum.generate_subset(4, 2, 3) == [1, 2]
    assert enum.generate_subset(4, 2, 4) == [1, 3]
    assert enum.generate_subset(4, 2, 5) == [2, 3]


def test_generate_subset_size_one():
    """Test generating subsets of size 1."""
    enum = SubsetEnumerator()

    assert enum.generate_subset(10, 1, 0) == [0]
    assert enum.generate_subset(10, 1, 1) == [1]
    assert enum.generate_subset(10, 1, 5) == [5]


def test_generate_subset_size_zero():
    """Test generating empty subset."""
    enum = SubsetEnumerator()

    assert enum.generate_subset(5, 0, 0) == []


def test_subset_index_basic():
    """Test finding indices of subsets."""
    enum = SubsetEnumerator()

    assert enum.subset_index(4, [0, 1]) == 0
    assert enum.subset_index(4, [0, 2]) == 1
    assert enum.subset_index(4, [0, 3]) == 2
    assert enum.subset_index(4, [1, 2]) == 3
    assert enum.subset_index(4, [1, 3]) == 4
    assert enum.subset_index(4, [2, 3]) == 5


def test_subset_index_single_element():
    """Test finding indices of single-element subsets."""
    enum = SubsetEnumerator()

    assert enum.subset_index(10, [0]) == 0
    assert enum.subset_index(10, [1]) == 1
    assert enum.subset_index(10, [5]) == 5


def test_subset_index_empty():
    """Test finding index of empty subset."""
    enum = SubsetEnumerator()

    assert enum.subset_index(5, []) == 0


def test_generate_and_index_inverse():
    """Test that generate_subset and subset_index are inverse operations."""
    enum = SubsetEnumerator()

    # Test for various sizes
    for k in [1, 2, 3, 4]:
        n = 10
        count = enum.binomial(n, k)
        for i in range(min(count, 20)):  # Test first 20 subsets
            subset = enum.generate_subset(n, k, i)
            assert enum.subset_index(n, subset) == i


def test_iter_subsets():
    """Test iterating over all subsets."""
    enum = SubsetEnumerator()

    # All 2-subsets of 4 elements
    subsets = list(enum.iter_subsets(4, 2))
    assert len(subsets) == 6
    assert subsets == [[0, 1], [0, 2], [0, 3], [1, 2], [1, 3], [2, 3]]


def test_iter_subsets_size_one():
    """Test iterating over size-1 subsets."""
    enum = SubsetEnumerator()

    subsets = list(enum.iter_subsets(5, 1))
    assert len(subsets) == 5
    assert subsets == [[0], [1], [2], [3], [4]]


def test_iter_subsets_full_size():
    """Test iterating when k equals n."""
    enum = SubsetEnumerator()

    subsets = list(enum.iter_subsets(3, 3))
    assert len(subsets) == 1
    assert subsets == [[0, 1, 2]]
