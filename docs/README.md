# 開發文件目錄

這個資料夾集中放 ThreadsInsight 的所有開發文件。第一次看的話，建議照下面的順序讀。

## 建議閱讀順序

| 順序 | 文件                               | 內容                                                                                                   |
| :--: | :--------------------------------- | :----------------------------------------------------------------------------------------------------- |
|  1   | [exam.md](exam.md)                 | 考題原文，以及我們的作答：開發時間表、為什麼沒用考題指定的技術、考題要求逐項對照（每一項在哪裡看得到） |
|  2   | [prd.md](prd.md)                   | 產品需求文件：要解決什麼問題、每個功能怎麼運作、怎樣才算完成、出錯時怎麼處理                           |
|  3   | [../AI_LOG.md](../AI_LOG.md)       | 和 AI 一起開發的紀錄：怎麼描述需求、AI 寫了什麼、怎麼驗證、AI 犯過哪些錯                               |
|  4   | [architecture.md](architecture.md) | 重要的技術決定和原因（例如為什麼從 Supabase 改成 PostgreSQL），以及線上部署方式                        |
|  5   | [schema.md](schema.md)             | 資料表說明：每張表存什麼、彼此怎麼關聯、誰能看哪些資料                                                 |
|  6   | [api-spec.md](api-spec.md)         | API 規格：每個網址收什麼、回什麼，以及示範資料的產生規則                                               |
|  7   | [design.md](design.md)             | 視覺設計稿：顏色、字體、元件樣式                                                                       |

## 其他地方

- **專案說明與安裝執行方式**：最外層的 [README.md](../README.md)，也有分析指標的定義和已知限制。
- **線上版**：網站 <https://web-production-b6984bbe.up.railway.app>，系統架構圖 <https://floorplan-production-3c17c79e.up.railway.app>（架構圖的檔案在 [floorplan/](floorplan/)）。
- **範例資料與報告**：[../data/](../data/) 和 [../reports/](../reports/)。
- **建立資料表的 SQL**：[../db/migrations/](../db/migrations/)。

最外層還有 `CLAUDE.md`、`AGENTS.md` 兩個檔案，是給 AI 開發工具讀的設定，不是給人看的文件，所以沒有搬進來。
