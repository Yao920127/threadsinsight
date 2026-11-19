"""會員登入（PRD F1、AC-1）：註冊、登入、登出、刪除帳號、未登入一律 401。"""

import pytest
from auth_support import USER_A, auth_headers
from fake_accounts import DEFAULT_PASSWORD, FakeAccountStore
from fastapi.testclient import TestClient

from threadsinsightapi import app as app_module
from threadsinsightapi import auth_api
from threadsinsightapi.auth import (
    InvalidSignupError,
    check_password_rules,
    normalize_email,
    token_hash,
)
from threadsinsightapi.passwords import burn_time, hash_password, verify_password
from threadsinsightapi.throttle import RateLimiter

ENDPOINTS = ["/api/mock-posts?username=demo_user", "/api/tasks", "/api/auth/me"]
PASSWORD = "correct-horse-1"


def fresh_client() -> TestClient:
    return TestClient(app_module.app)


def signup(client: TestClient, email: str = "new_user@example.com", password: str = PASSWORD):
    return client.post("/api/auth/signup", json={"email": email, "password": password})


class TestPasswords:
    def test_hash_verifies_only_the_right_password(self) -> None:
        stored = hash_password(PASSWORD)
        assert stored.startswith("scrypt$")
        assert PASSWORD not in stored
        assert verify_password(PASSWORD, stored)
        assert not verify_password("wrong-password", stored)

    def test_same_password_gets_different_salt(self) -> None:
        assert hash_password(PASSWORD) != hash_password(PASSWORD)

    @pytest.mark.parametrize("stored", ["", "plain", "bcrypt$1$2$3$a$b", "scrypt$x$8$1$a$b"])
    def test_malformed_hash_never_matches(self, stored: str) -> None:
        assert not verify_password(PASSWORD, stored)

    def test_burn_time_runs_without_error(self) -> None:
        burn_time(PASSWORD)


class TestRules:
    def test_email_is_normalized(self) -> None:
        assert normalize_email("  User@Example.COM ") == "user@example.com"

    @pytest.mark.parametrize(
        "email", ["", "no-at-sign", "a@b", "a b@example.com", "x" * 250 + "@a.co"]
    )
    def test_invalid_emails_are_rejected(self, email: str) -> None:
        with pytest.raises(InvalidSignupError):
            normalize_email(email)

    @pytest.mark.parametrize("password", ["short", "x" * 129])
    def test_password_length_rules(self, password: str) -> None:
        with pytest.raises(InvalidSignupError):
            check_password_rules(password)


class TestSignup:
    def test_creates_account_and_signs_in(self, accounts: FakeAccountStore) -> None:
        client = fresh_client()
        response = signup(client, "New_User@Example.com")

        assert response.status_code == 201
        assert response.json()["data"]["email"] == "new_user@example.com"
        cookie = response.headers["set-cookie"]
        assert "ti_session=" in cookie
        assert "HttpOnly" in cookie
        assert "SameSite=strict" in cookie
        assert client.get("/api/auth/me").json()["data"]["email"] == "new_user@example.com"
        _, stored = accounts.users["new_user@example.com"]
        assert PASSWORD not in stored

    def test_secure_cookie_by_default(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.delenv("COOKIE_SECURE")
        assert "Secure" in signup(fresh_client()).headers["set-cookie"]

    def test_duplicate_email_is_409(self) -> None:
        client = fresh_client()
        signup(client)
        response = signup(fresh_client(), "NEW_USER@example.com")
        assert response.status_code == 409
        assert response.json()["error"] == "Email already registered"

    @pytest.mark.parametrize(
        ("email", "password"), [("not-an-email", PASSWORD), ("ok@example.com", "short")]
    )
    def test_invalid_input_is_400(self, email: str, password: str) -> None:
        assert signup(fresh_client(), email, password).status_code == 400

    def test_missing_fields_are_400(self) -> None:
        assert fresh_client().post("/api/auth/signup", json={}).status_code == 400


class TestLogin:
    def login(self, email: str, password: str):
        client = fresh_client()
        return client, client.post("/api/auth/login", json={"email": email, "password": password})

    def test_correct_password_signs_in(self) -> None:
        client, response = self.login("USER_A@example.com", DEFAULT_PASSWORD)
        assert response.status_code == 200
        assert client.get("/api/auth/me").json()["data"]["id"] == USER_A

    @pytest.mark.parametrize(
        ("email", "password"),
        [
            ("user_a@example.com", "wrong-password"),
            ("nobody@example.com", DEFAULT_PASSWORD),
            ("not-an-email", DEFAULT_PASSWORD),
        ],
    )
    def test_failures_share_one_message(self, email: str, password: str) -> None:
        _, response = self.login(email, password)
        assert response.status_code == 401
        assert response.json()["error"] == "Invalid email or password"
        assert "set-cookie" not in response.headers

    def test_rate_limited_per_ip(self) -> None:
        auth_api.auth_limiter = RateLimiter(2, 60)
        statuses = [
            self.login("user_a@example.com", "wrong-password")[1].status_code for _ in range(3)
        ]
        assert statuses == [401, 401, 429]


class TestSessionLifecycle:
    def test_logout_invalidates_session_on_server(self, accounts: FakeAccountStore) -> None:
        client = fresh_client()
        signup(client)
        token = client.cookies.get("ti_session")
        assert client.post("/api/auth/logout").status_code == 200
        assert token_hash(token) not in accounts.sessions
        assert (
            TestClient(app_module.app, cookies={"ti_session": token})
            .get("/api/auth/me")
            .status_code
            == 401
        )

    def test_logout_without_session_is_ok(self) -> None:
        assert fresh_client().post("/api/auth/logout").status_code == 200

    def test_delete_account(self, accounts: FakeAccountStore) -> None:
        client = TestClient(app_module.app, headers=auth_headers())
        response = client.delete("/api/auth/me")
        assert response.status_code == 200
        assert accounts.deleted_users == [USER_A]
        assert client.get("/api/auth/me").status_code == 401


class TestEndpointsRequireLogin:
    @pytest.mark.parametrize("path", ENDPOINTS)
    def test_without_session_returns_401(self, path: str) -> None:
        response = fresh_client().get(path)
        assert response.status_code == 401
        assert response.json() == {
            "success": False,
            "data": None,
            "error": "Authentication required",
        }
        assert response.headers["cache-control"] == "no-store"

    @pytest.mark.parametrize("path", ENDPOINTS)
    def test_unknown_session_returns_401(self, path: str) -> None:
        client = TestClient(app_module.app, cookies={"ti_session": "forged"})
        assert client.get(path).status_code == 401

    def test_auth_is_checked_before_parameters(self) -> None:
        assert fresh_client().get("/api/mock-posts").status_code == 401


class TestCrossSite:
    def test_cross_site_post_is_rejected(self) -> None:
        client = TestClient(app_module.app, headers=auth_headers())
        response = client.post(
            "/api/tasks", json={"username": "demo_user"}, headers={"Origin": "https://evil.example"}
        )
        assert response.status_code == 403
        assert response.json()["error"] == "Cross-site request rejected"

    def test_same_site_post_is_allowed(self) -> None:
        client = TestClient(app_module.app, headers=auth_headers())
        response = client.post(
            "/api/tasks",
            json={"username": "demo_user", "count": 5},
            headers={"Origin": "http://testserver"},
        )
        assert response.status_code == 201

    def test_cross_site_get_is_not_blocked_by_origin_check(self) -> None:
        client = TestClient(app_module.app, headers=auth_headers())
        response = client.get("/api/tasks", headers={"Origin": "https://evil.example"})
        assert response.status_code == 200
