# 斷詞詞典

`dict.txt.big` 是 Jieba 官方提供的繁體加強版詞典，取代 Jieba 內建、偏簡體的 `dict.txt`。

- 來源：<https://github.com/fxsjy/jieba/blob/master/extra_dict/dict.txt.big>
- 授權：MIT（與 Jieba 相同）
- 格式：每行 `詞 詞頻 詞性`
- 取得日期：2026-11-19
- SHA-256：見下方，更新詞典時一併更新

```
b16011275c42955ccd81fc1adecc93a59dbb7926af69d93fc95d4943d40f6aad  dict.txt.big
```

由 `threadsinsightapi/keywords.py` 載入。第一次使用時 Jieba 會在系統暫存目錄建立快取，之後載入約 0.5 秒。
