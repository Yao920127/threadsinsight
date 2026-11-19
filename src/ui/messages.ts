/** 把 API 與網路錯誤轉成給使用者看的繁體中文訊息；原始訊息不直接顯示。 */
import { ApiError } from "../api/envelope.ts";
import { TASK_FAILED_MESSAGE } from "./taskList.ts";

export function toUserMessage(error: unknown): string {
  if (error instanceof DOMException && error.name === "TimeoutError") {
    return "分析服務回應逾時，請稍後再試。";
  }
  if (!(error instanceof ApiError)) {
    return "發生未預期的錯誤，請重新整理頁面後再試。";
  }
  if (error.kind === "network") {
    return "無法連線到分析服務，請確認 API 已啟動（vp run api:dev）。";
  }
  if (error.kind === "invalid_response") {
    return "分析服務回傳的資料格式不符，已停止顯示以避免混入非合成資料。";
  }
  if (error.status === 401) {
    return "登入階段已過期，請重新登入。";
  }
  if (error.status === 503 && /auth/i.test(error.message)) {
    return "登入驗證服務暫時無法使用，請確認 Supabase 已啟動（supabase start）。";
  }
  if (error.status === 503 && /database/i.test(error.message)) {
    return "資料庫暫時無法使用，請確認 Supabase 已啟動（supabase start）。";
  }
  if (error.message === "Analysis failed") {
    return TASK_FAILED_MESSAGE;
  }
  if (error.status === 404) {
    return "找不到這個分析任務，可能已被刪除。";
  }
  if (error.status === 409) {
    return "這個任務尚未完成，請等它完成或重新執行。";
  }
  if (error.status === 429) {
    return "操作太頻繁，請稍候一分鐘再試。";
  }
  if (error.status !== null && error.status >= 500) {
    return "伺服器暫時無法產生資料，請稍後再試。";
  }
  if (/count/i.test(error.message)) {
    return "貼文數必須是 1 到 50 之間的整數。";
  }
  if (/username/i.test(error.message)) {
    return "帳號格式不正確：請輸入 Threads 帳號名稱（英數字、句點、底線，最多 30 字）或 threads.com 個人頁網址。";
  }
  return "請求無法完成，請檢查輸入後再試。";
}
