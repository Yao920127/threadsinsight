"""可重現亂數。逐位元對齊 src/mock/random.ts（FNV-1a 種子 + mulberry32）。

JS 的位元運算以 32-bit 整數進行；這裡以無號 32-bit 表示並在每步遮罩，
低 32 位元結果與 JS 完全相同，因此兩種語言產出的亂數序列一致。
"""

import math
from collections.abc import Sequence

_MASK = 0xFFFFFFFF
_TWO_POW_32 = 4294967296


def _imul(a: int, b: int) -> int:
    return (a * b) & _MASK


def hash_seed(text: str) -> int:
    """FNV-1a，以 Unicode code point 為單位（同 JS 的 for...of）。"""
    value = 0x811C9DC5
    for char in text:
        value = _imul(value ^ ord(char), 0x01000193)
    return value


class Random:
    """mulberry32。狀態只在 next() 內部推進。"""

    def __init__(self, seed: int) -> None:
        self._state = seed & _MASK

    def next(self) -> float:
        self._state = (self._state + 0x6D2B79F5) & _MASK
        t = self._state
        t = _imul(t ^ (t >> 15), t | 1)
        t ^= (t + _imul(t ^ (t >> 7), t | 61)) & _MASK
        return ((t ^ (t >> 14)) & _MASK) / _TWO_POW_32

    def int(self, low: int, high: int) -> int:
        """[low, high] 整數。"""
        return low + math.floor(self.next() * (high - low + 1))

    def pick[T](self, items: Sequence[T]) -> T:
        return items[self.int(0, len(items) - 1)]

    def shuffle[T](self, items: Sequence[T]) -> list[T]:
        """回傳打亂後的新串列（Fisher–Yates，與 TS 相同的抽取順序）。"""
        result = list(items)
        for i in range(len(result) - 1, 0, -1):
            j = self.int(0, i)
            result[i], result[j] = result[j], result[i]
        return result

    def chance(self, probability: float) -> bool:
        return self.next() < probability


def pick_weighted[T](rng: Random, entries: Sequence[tuple[T, float]]) -> T:
    total = sum(weight for _, weight in entries)
    roll = rng.next() * total
    for value, weight in entries:
        roll -= weight
        if roll < 0:
            return value
    return entries[-1][0]


def block_pattern[T](rng: Random, total: int, composition: Sequence[tuple[T, int]]) -> list[T]:
    """每組內各值出現次數固定再打亂，確保以組為單位的前綴維持相同比例。"""
    block = [value for value, times in composition for _ in range(times)]
    blocks = math.ceil(total / len(block))
    return [item for _ in range(blocks) for item in rng.shuffle(block)][:total]
