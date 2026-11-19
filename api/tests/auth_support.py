"""測試用的會員與登入狀態：兩個固定的虛構帳號，各有一個預先登入的 cookie。"""

USER_A = "11111111-1111-1111-1111-111111111111"
USER_B = "22222222-2222-2222-2222-222222222222"
EMAILS = {USER_A: "user_a@example.com", USER_B: "user_b@example.com"}
# 固定的測試用登入憑證（只存在記憶體版假資料庫裡）
SESSION_TOKENS = {USER_A: "test-session-user-a", USER_B: "test-session-user-b"}


def auth_headers(user_id: str = USER_A) -> dict[str, str]:
    """以 cookie 帶上指定使用者的登入狀態。"""
    return {"Cookie": f"ti_session={SESSION_TOKENS[user_id]}"}
