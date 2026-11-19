"""單一程序內的簡易限流（AI 建議每次呼叫都要付費）。

多台伺服器或重啟後不共用；需要時改用共享儲存。24 小時快取已改存資料庫（ADR-001 原則 5）。
"""

import threading
import time
from collections import deque
from collections.abc import Callable, Hashable


class RateLimiter:
    """滑動視窗：每個 key 在 window 秒內最多 limit 次。"""

    def __init__(self, limit: int, window: float, clock: Callable[[], float] = time.monotonic):
        self._limit = limit
        self._window = window
        self._clock = clock
        self._hits: dict[Hashable, deque[float]] = {}
        self._lock = threading.Lock()

    def allow(self, key: Hashable) -> bool:
        now = self._clock()
        with self._lock:
            hits = self._hits.setdefault(key, deque())
            while hits and now - hits[0] >= self._window:
                hits.popleft()
            if len(hits) >= self._limit:
                return False
            hits.append(now)
            return True
