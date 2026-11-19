"""登入憑證驗證（PRD AC-1：未登入一律 401）。token 以本機金鑰簽發，不連 Supabase。"""

import time

import jwt
import pytest
from auth_support import USER_A, StaticResolver, make_token
from fastapi.testclient import TestClient

from threadsinsightapi import app as app_module
from threadsinsightapi.auth import (
    AuthError,
    AuthUnavailableError,
    expected_issuer,
    parse_bearer,
    verify_access_token,
)

ENDPOINTS = ["/api/mock-posts", "/api/tasks", "/api/tasks/aaaaaaaa-0000-0000-0000-000000000001"]
PARAMS = {"username": "demo_user", "count": 5}
anonymous = TestClient(app_module.app)


def _verify(token: str):
    return verify_access_token(token, StaticResolver(), expected_issuer())


class TestParseBearer:
    def test_extracts_token(self) -> None:
        assert parse_bearer("Bearer abc.def.ghi") == "abc.def.ghi"
        assert parse_bearer("bearer  abc ") == "abc"

    @pytest.mark.parametrize("header", [None, "", "Bearer", "Bearer   ", "Basic abc", "abc"])
    def test_rejects_missing_or_malformed(self, header: str | None) -> None:
        with pytest.raises(AuthError):
            parse_bearer(header)


class TestVerifyAccessToken:
    def test_valid_token_returns_user(self) -> None:
        token = make_token()
        user = _verify(token)
        assert user.id == USER_A
        assert user.email == "user_a@example.com"
        assert user.access_token == token

    def test_missing_email_is_none(self) -> None:
        assert _verify(make_token(email=None)).email is None

    @pytest.mark.parametrize(
        "token_kwargs",
        [
            pytest.param({"exp": int(time.time()) - 60}, id="expired"),
            pytest.param({"aud": "other"}, id="wrong-audience"),
            pytest.param({"iss": "https://evil.example/auth/v1"}, id="wrong-issuer"),
            pytest.param({"role": "anon"}, id="anon-role"),
            pytest.param({"role": "service_role"}, id="service-role"),
            pytest.param({"sub": "not-a-uuid"}, id="bad-subject"),
            pytest.param({"exp": None}, id="no-expiry"),
            pytest.param({"signed_by_other_key": True}, id="forged-signature"),
            pytest.param({"algorithm": "HS256"}, id="symmetric-algorithm"),
        ],
    )
    def test_rejects_invalid_tokens(self, token_kwargs: dict) -> None:
        with pytest.raises(AuthError):
            _verify(make_token(**token_kwargs))

    def test_rejects_unknown_key_id(self) -> None:
        token = jwt.encode({"sub": USER_A}, "x" * 32, algorithm="HS256", headers={"kid": "unknown"})
        with pytest.raises(AuthError):
            _verify(token)

    def test_rejects_garbage(self) -> None:
        with pytest.raises(AuthError):
            _verify("not-a-jwt")

    def test_jwks_unreachable_is_unavailable(self) -> None:
        class Down:
            def get_signing_key_from_jwt(self, _token: str):
                raise jwt.PyJWKClientConnectionError("connection refused")

        with pytest.raises(AuthUnavailableError):
            verify_access_token(make_token(), Down(), expected_issuer())


class TestEndpointsRequireLogin:
    @pytest.mark.parametrize("path", ENDPOINTS)
    def test_without_token_returns_401_envelope(self, path: str) -> None:
        response = anonymous.get(path, params=PARAMS)
        assert response.status_code == 401
        assert response.headers["www-authenticate"] == "Bearer"
        assert response.headers["cache-control"] == "no-store"
        assert response.json() == {
            "success": False,
            "data": None,
            "error": "Authentication required",
        }

    @pytest.mark.parametrize("path", ENDPOINTS)
    def test_expired_token_returns_401(self, path: str) -> None:
        token = make_token(exp=int(time.time()) - 60)
        response = anonymous.get(path, params=PARAMS, headers={"Authorization": f"Bearer {token}"})
        assert response.status_code == 401

    def test_auth_is_checked_before_parameters(self) -> None:
        """未登入時不透露參數驗證結果。"""
        assert anonymous.get("/api/mock-posts").status_code == 401

    def test_error_does_not_echo_token(self) -> None:
        token = make_token(signed_by_other_key=True)
        response = anonymous.get(
            "/api/mock-posts", params=PARAMS, headers={"Authorization": f"Bearer {token}"}
        )
        assert response.status_code == 401
        assert token not in response.text

    def test_valid_token_is_accepted(self) -> None:
        token = make_token()
        response = anonymous.get(
            "/api/mock-posts", params=PARAMS, headers={"Authorization": f"Bearer {token}"}
        )
        assert response.status_code == 200
        assert response.headers["cache-control"] == "no-store"

    def test_jwks_unreachable_returns_503(self) -> None:
        class Down:
            def get_signing_key_from_jwt(self, _token: str):
                raise jwt.PyJWKClientConnectionError("connection refused")

        app_module.app.dependency_overrides[app_module.get_key_resolver] = Down
        response = anonymous.get(
            "/api/mock-posts", params=PARAMS, headers={"Authorization": f"Bearer {make_token()}"}
        )
        assert response.status_code == 503
        assert response.json()["error"] == "Authentication service unavailable"


def test_issuer_follows_supabase_url(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("SUPABASE_URL", "http://supabase.local:8000/")
    assert expected_issuer() == "http://supabase.local:8000/auth/v1"


def test_issuer_can_be_overridden_for_containers(monkeypatch: pytest.MonkeyPatch) -> None:
    from threadsinsightapi.auth import jwks_url

    monkeypatch.setenv("SUPABASE_URL", "http://host.docker.internal:54321")
    monkeypatch.setenv("SUPABASE_JWT_ISSUER", "http://127.0.0.1:54321/auth/v1")
    assert expected_issuer() == "http://127.0.0.1:54321/auth/v1"
    assert jwks_url() == "http://host.docker.internal:54321/auth/v1/.well-known/jwks.json"
