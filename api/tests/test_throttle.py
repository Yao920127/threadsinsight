from threadsinsightapi.throttle import RateLimiter


class Clock:
    def __init__(self) -> None:
        self.now = 0.0

    def __call__(self) -> float:
        return self.now


def test_rate_limiter_allows_up_to_the_limit_per_window() -> None:
    clock = Clock()
    limiter = RateLimiter(limit=2, window=60, clock=clock)

    assert limiter.allow("a")
    assert limiter.allow("a")
    assert not limiter.allow("a")
    assert limiter.allow("b")  # 各 key 獨立

    clock.now = 60
    assert limiter.allow("a")  # 視窗滑過後恢復
