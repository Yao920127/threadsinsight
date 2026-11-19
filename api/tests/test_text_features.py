import pytest

from threadsinsightapi.content import LIBRARY
from threadsinsightapi.generator import generate_mock_dataset
from threadsinsightapi.text_features import (
    classify_topic,
    count_sentences,
    extract_text_features,
    has_cta,
    polarity_of,
    sentiment_of,
)


@pytest.mark.parametrize(
    ("content", "expected"),
    [
        ("一句話。", 1),
        ("第一句。第二句！第三句？", 3),
        ("主文\n結語\n#tag", 3),
        ("", 0),
        ("。。", 0),
    ],
)
def test_count_sentences(content: str, expected: int) -> None:
    assert count_sentences(content) == expected


@pytest.mark.parametrize(
    ("content", "expected"),
    [
        ("大家怎麼看？留言聊聊。", True),
        ("想聽聽大家的做法。", True),
        ("記得 Tag 一位朋友", True),
        ("今天天氣很好。", False),
    ],
)
def test_has_cta(content: str, expected: bool) -> None:
    assert has_cta(content) is expected


def test_question_is_detected_with_full_and_half_width_marks() -> None:
    assert extract_text_features("你覺得呢？").has_question
    assert extract_text_features("Why?").has_question
    assert not extract_text_features("想聽聽大家的做法。").has_question


class TestSentiment:
    def test_polarity_counts_lexicon_words(self) -> None:
        assert polarity_of("整理完心情輕鬆，很開心") == 1.0
        assert polarity_of("壓力好大，一直焦慮") < 0
        assert polarity_of("今天開會") == 0.0

    @pytest.mark.parametrize(
        ("polarity", "label"),
        [(1.0, "positive"), (0.21, "positive"), (0.2, "neutral"), (0.0, "neutral"),
         (-0.2, "neutral"), (-0.21, "negative"), (-1.0, "negative")],
    )  # fmt: skip
    def test_thresholds(self, polarity: float, label: str) -> None:
        assert sentiment_of(polarity) == label

    def test_ignores_words_inside_urls_and_hashtags(self) -> None:
        assert polarity_of("#開心 https://example.com/開心") == 0.0


class TestTopic:
    @pytest.mark.parametrize(
        ("content", "topic"),
        [
            # 不在合成主題庫內的新句子，用來檢查詞典不只是背答案
            ("明天要跟老闆談升遷，履歷也更新好了。", "career"),
            ("這週去旅行，每天早起運動，吃飯也很規律。", "life"),
            ("新版 app 的系統更新後，手機軟體跑得更順。", "tech"),
            ("過程比結果重要，我相信慢慢累積的力量。", "opinion"),
            ("今天天氣不錯。", "other"),
        ],
    )
    def test_unseen_sentences(self, content: str, topic: str) -> None:
        assert classify_topic(content) == topic

    def test_tie_breaks_by_topic_order(self) -> None:
        assert classify_topic("工作與生活") == "career"

    def test_matches_library_topics_on_generated_posts(self) -> None:
        # 詞典參考過主題庫撰寫，這裡是回歸測試而非準確度證明
        names = ("career", "life", "tech", "opinion")
        truth = {body: names[i] for i, t in enumerate(LIBRARY.topics) for body in t.bodies}
        posts = generate_mock_dataset("demo_user", count=50).posts

        assert all(classify_topic(p.content) == truth[p.content.split("\n")[0]] for p in posts)
