"""AI 策略：一律用假的 client，不呼叫真正的 Anthropic API，也不需要金鑰。"""

from types import SimpleNamespace
from typing import Any

import anthropic
import httpx2
import pytest

from threadsinsightapi.ai_strategy import (
    MAX_TOKENS,
    MODEL,
    NOTICE_AUTH,
    NOTICE_DISABLED,
    NOTICE_ERROR,
    NOTICE_TIMEOUT,
    AiInsight,
    AiRewrite,
    AiStrategy,
    ai_enabled,
    build_prompt,
    generate_ai_strategy,
    lowest_post,
)
from threadsinsightapi.pipeline import Analysis, analyze

REQUEST = httpx2.Request("POST", "https://api.anthropic.com/v1/messages")


def _output(**overrides: Any) -> AiStrategy:
    base = {
        "insights": [
            AiInsight(title=f"觀察 {n}", evidence=f"{n} 篇平均互動 100。", action="下一篇試試看。")
            for n in (1, 2, 3)
        ],
        "rewrite": AiRewrite(after="改寫後的內容。\n你們怎麼看？", changes=["加上提問"]),
    }
    return AiStrategy(**{**base, **overrides})


class FakeMessages:
    def __init__(self, result: Any) -> None:
        self.result = result
        self.calls: list[dict[str, Any]] = []

    def parse(self, **kwargs: Any) -> Any:
        self.calls.append(kwargs)
        if isinstance(self.result, Exception):
            raise self.result
        return self.result


class FakeClient:
    def __init__(self, result: Any) -> None:
        self.messages = FakeMessages(result)


def _response(output: AiStrategy | None, stop_reason: str = "end_turn") -> SimpleNamespace:
    return SimpleNamespace(
        stop_reason=stop_reason,
        parsed_output=output,
        usage=SimpleNamespace(input_tokens=1200, output_tokens=300),
        _request_id="req_test",
    )


@pytest.fixture(scope="module")
def analysis() -> Analysis:
    return analyze("demo_user", 30)


def _run(client: Any, analysis: Analysis) -> Any:
    return generate_ai_strategy(
        client,
        analysis.dataset.username,
        analysis.nlp.posts,
        analysis.stats,
        analysis.nlp.attribution,
        analysis.strategy,
    )


class TestSuccess:
    def test_returns_llm_strategy_for_the_lowest_post(self, analysis: Analysis) -> None:
        result = _run(FakeClient(_response(_output())), analysis)

        target = lowest_post(analysis.nlp.posts)
        assert target is not None
        assert result.source == "llm"
        assert result.model == MODEL
        assert result.notice is None
        assert [i.title for i in result.insights] == ["觀察 1", "觀察 2", "觀察 3"]
        assert all(i.category == "ai" and i.lift is None for i in result.insights)
        assert result.rewrite is not None
        assert result.rewrite.post_url == target.post_url
        assert result.rewrite.before == target.content

    def test_sends_the_expected_request(self, analysis: Analysis) -> None:
        client = FakeClient(_response(_output()))

        _run(client, analysis)

        call = client.messages.calls[0]
        assert call["model"] == "claude-haiku-5-5"
        assert call["max_tokens"] == MAX_TOKENS
        assert call["output_config"] == {"effort": "medium"}
        assert call["output_format"] is AiStrategy
        assert "合成示範資料" in call["system"]
        assert call["messages"][-1]["role"] == "user"  # 不使用 assistant prefill
        assert "temperature" not in call


class TestFallback:
    @pytest.mark.parametrize(
        ("error", "notice"),
        [
            (anthropic.APITimeoutError(request=REQUEST), NOTICE_TIMEOUT),
            (anthropic.APIConnectionError(request=REQUEST), NOTICE_ERROR),
            (ValueError("bad json"), NOTICE_ERROR),
            (
                anthropic.AuthenticationError(
                    "invalid x-api-key",
                    response=httpx2.Response(401, request=REQUEST),
                    body=None,
                ),
                NOTICE_AUTH,
            ),
        ],
    )
    def test_errors_fall_back_to_the_rule_engine(
        self, analysis: Analysis, error: Exception, notice: str
    ) -> None:
        result = _run(FakeClient(error), analysis)

        assert result.source == "rule_engine"
        assert result.insights == analysis.strategy.insights
        assert result.notice == notice

    @pytest.mark.parametrize("stop_reason", ["refusal", "max_tokens"])
    def test_refusal_or_truncation_falls_back(self, analysis: Analysis, stop_reason: str) -> None:
        result = _run(FakeClient(_response(_output(), stop_reason)), analysis)
        assert result.source == "rule_engine"
        assert result.notice == NOTICE_ERROR

    def test_missing_parsed_output_falls_back(self, analysis: Analysis) -> None:
        assert _run(FakeClient(_response(None)), analysis).source == "rule_engine"

    @pytest.mark.parametrize(
        "output",
        [
            _output(insights=_output().insights[:2]),
            _output(
                insights=[*_output().insights[:2], AiInsight(title=" ", evidence="x", action="y")]
            ),
            _output(
                insights=[
                    *_output().insights[:2],
                    AiInsight(title="很" * 41, evidence="x", action="y"),
                ]
            ),
            _output(rewrite=AiRewrite(after="看 https://www.threads.com/@x", changes=["x"])),
            _output(rewrite=AiRewrite(after="延伸閱讀 https://example.com", changes=["x"])),
            _output(rewrite=AiRewrite(after="改寫", changes=[])),
        ],
    )
    def test_invalid_output_is_rejected(self, analysis: Analysis, output: AiStrategy) -> None:
        result = _run(FakeClient(_response(output)), analysis)
        assert result.source == "rule_engine"
        assert result.notice == NOTICE_ERROR

    def test_disabled_client_explains_why(self, analysis: Analysis) -> None:
        result = _run(None, analysis)
        assert result.source == "rule_engine"
        assert result.notice == NOTICE_DISABLED

    def test_keeps_the_small_sample_notice(self) -> None:
        small = analyze("demo_user", 5)
        result = generate_ai_strategy(
            None,
            small.dataset.username,
            small.nlp.posts,
            small.stats,
            small.nlp.attribution,
            small.strategy,
        )
        assert result.notice is not None
        assert result.notice.startswith(NOTICE_DISABLED)
        assert "樣本少於 10 篇" in result.notice


def test_prompt_contains_only_aggregates_and_synthetic_text(analysis: Analysis) -> None:
    prompt = build_prompt(
        analysis.dataset.username,
        analysis.nlp.posts,
        analysis.stats,
        analysis.nlp.attribution,
        analysis.strategy,
    )

    assert '"post_count": 30' in prompt
    assert "lowest_post" in prompt
    assert "mock://" not in prompt
    assert "threads.com" not in prompt
    assert len(prompt) < 12_000  # 精簡：遠低於 Haiku 5.5 的 100K token 價格分界


@pytest.mark.parametrize(
    ("env", "expected"),
    [
        ({}, False),
        ({"ANTHROPIC_API_KEY": "sk-test"}, True),
        ({"ANTHROPIC_AUTH_TOKEN": "token"}, True),
        ({"ANTHROPIC_API_KEY": "sk-test", "THREADSINSIGHT_AI": "off"}, False),
        ({"THREADSINSIGHT_AI": "on"}, True),
    ],
)
def test_ai_enabled(monkeypatch: pytest.MonkeyPatch, env: dict[str, str], expected: bool) -> None:
    for name in ("ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN", "THREADSINSIGHT_AI"):
        monkeypatch.delenv(name, raising=False)
    for name, value in env.items():
        monkeypatch.setenv(name, value)
    assert ai_enabled() is expected


def test_client_uses_prd_timeout_and_retries(monkeypatch: pytest.MonkeyPatch) -> None:
    from threadsinsightapi.ai_strategy import create_client

    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-test-not-used")  # 只建立物件，不發請求
    created = create_client()

    assert created.timeout == 30.0
    assert created.max_retries == 2


def test_lowest_post_of_nothing_is_none() -> None:
    assert lowest_post([]) is None


def test_get_ai_client_follows_the_switch(monkeypatch: pytest.MonkeyPatch) -> None:
    from threadsinsightapi import dependencies as app_module

    monkeypatch.setenv("THREADSINSIGHT_AI", "off")
    assert app_module.get_ai_client() is None

    monkeypatch.setenv("THREADSINSIGHT_AI", "on")
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-test-not-used")
    app_module._default_client.cache_clear()
    assert isinstance(app_module.get_ai_client(), anthropic.Anthropic)
    app_module._default_client.cache_clear()


@pytest.mark.parametrize(
    ("value", "valid"),
    [
        ("sk-ant-api03-" + "a" * 40, True),
        ("  sk-ant-api03-" + "Ab_-9" * 10 + "  ", True),
        ("sk-ant-short", False),
        ("sk-proj-" + "a" * 40, False),
        ("sk-ant-" + "a" * 30 + " x", False),
        ("", False),
    ],
)
def test_is_valid_user_key(value: str, valid: bool) -> None:
    from threadsinsightapi.ai_strategy import is_valid_user_key

    assert is_valid_user_key(value) is valid


def test_create_client_accepts_a_user_key() -> None:
    from threadsinsightapi.ai_strategy import create_client

    assert create_client("sk-ant-api03-" + "a" * 40).api_key == "sk-ant-api03-" + "a" * 40


class TestLlmCallLog:
    """PRD 第 7 節：記錄 LLM 呼叫狀態；不記錄提示內容與金鑰。"""

    def _events(self, caplog: pytest.LogCaptureFixture) -> list[dict[str, Any]]:
        return [
            record.event_fields for record in caplog.records if record.getMessage() == "llm.call"
        ]

    def test_success_records_tokens_and_duration(
        self, analysis: Analysis, caplog: pytest.LogCaptureFixture
    ) -> None:
        caplog.set_level("INFO", logger="threadsinsightapi")
        _run(FakeClient(_response(_output())), analysis)

        [event] = self._events(caplog)
        assert event["status"] == "success"
        assert event["model"] == "claude-haiku-5-5"
        assert event["input_tokens"] == 1200
        assert event["output_tokens"] == 300
        assert event["duration_ms"] >= 0

    @pytest.mark.parametrize(
        ("client", "status"),
        [
            (None, "disabled"),
            ("timeout", "timeout"),
            ("refusal", "refusal"),
            ("max_tokens", "incomplete"),
        ],
    )
    def test_failures_record_status(
        self, analysis: Analysis, caplog: pytest.LogCaptureFixture, client: Any, status: str
    ) -> None:
        caplog.set_level("INFO", logger="threadsinsightapi")
        fakes = {
            "timeout": FakeClient(anthropic.APITimeoutError(request=REQUEST)),
            "refusal": FakeClient(_response(_output(), "refusal")),
            "max_tokens": FakeClient(_response(_output(), "max_tokens")),
        }
        _run(fakes.get(client) if client else None, analysis)

        [event] = self._events(caplog)
        assert event["status"] == status

    def test_prompt_and_post_content_are_not_logged(
        self, analysis: Analysis, caplog: pytest.LogCaptureFixture
    ) -> None:
        from threadsinsightapi.observability import JsonFormatter

        caplog.set_level("DEBUG", logger="threadsinsightapi")
        _run(FakeClient(_response(_output())), analysis)

        text = "\n".join(JsonFormatter().format(record) for record in caplog.records)
        assert analysis.nlp.posts[0].content not in text
        assert "合成示範資料" not in text  # 系統提示
