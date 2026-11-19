"""測試共用的假 Anthropic client。"""

from types import SimpleNamespace
from typing import Any

from threadsinsightapi.ai_strategy import AiInsight, AiRewrite, AiStrategy


class _Messages:
    def __init__(self) -> None:
        self.calls: list[dict[str, Any]] = []

    def parse(self, **kwargs: Any) -> SimpleNamespace:
        self.calls.append(kwargs)
        return SimpleNamespace(
            stop_reason="end_turn",
            parsed_output=AiStrategy(
                insights=[
                    AiInsight(title=f"觀察 {n}", evidence="9 篇平均互動 1500。", action="試試看。")
                    for n in (1, 2, 3)
                ],
                rewrite=AiRewrite(after="改寫後。", changes=["加上提問"]),
            ),
            usage=SimpleNamespace(input_tokens=1, output_tokens=1),
            _request_id="req_test",
        )


def fake_success_client() -> SimpleNamespace:
    return SimpleNamespace(messages=_Messages())
