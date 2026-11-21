import "./style.css";
import "./ui/login.css";
import { isUnauthorized } from "./api/envelope.ts";
import { fetchCurrentAccount, signIn, signUp } from "./auth/authClient.ts";
import { authErrorMessage, loginReasonMessage } from "./auth/authMessages.ts";
import { parseLoginReason, safeNextPath } from "./auth/redirect.ts";
import { escapeHtml } from "./ui/html.ts";
import { initFormValidation } from "./ui/formValidation.ts";

const REQUEST_TIMEOUT_MS = 15_000;

function requireElement<T extends Element>(selector: string, type: { new (): T }): T {
  const element = document.querySelector(selector);
  if (!(element instanceof type)) throw new Error(`Missing required element: ${selector}`);
  return element;
}

const passwordForm = requireElement("#password-form", HTMLFormElement);
const emailInput = requireElement("#email", HTMLInputElement);
const passwordInput = requireElement("#password", HTMLInputElement);
const status = requireElement("#login-status", HTMLElement);
const announcer = requireElement("#login-announcer", HTMLElement);

const params = new URLSearchParams(window.location.search);
const nextPath = safeNextPath(params.get("next"), window.location.origin);

function setStatus(message: string, tone: "info" | "error" | "success" = "info"): void {
  status.dataset.tone = tone;
  status.innerHTML =
    tone === "error"
      ? `<span role="img" aria-label="錯誤">⚠</span> ${escapeHtml(message)}`
      : escapeHtml(message);
}

function setBusy(busy: boolean): void {
  passwordForm.setAttribute("aria-busy", String(busy));
  passwordForm.querySelectorAll("button").forEach((button) => {
    button.disabled = busy;
  });
}

function goNext(): void {
  window.location.replace(nextPath);
}

passwordForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const mode =
    event.submitter instanceof HTMLButtonElement && event.submitter.value === "sign-up"
      ? "sign-up"
      : "sign-in";
  const credentials = { email: emailInput.value.trim(), password: passwordInput.value };
  const send = mode === "sign-up" ? signUp : signIn;
  setBusy(true);
  setStatus(mode === "sign-up" ? "正在建立帳號…" : "登入中…");
  send(credentials, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) })
    .then(goNext)
    .catch((error: unknown) => {
      passwordInput.value = "";
      setStatus(authErrorMessage(error), "error");
    })
    .finally(() => setBusy(false));
});

const DEMO_CREDENTIALS = { email: "demo@example.com", password: "demo-test-2026" } as const;

requireElement("#fill-demo", HTMLButtonElement).addEventListener("click", () => {
  emailInput.value = DEMO_CREDENTIALS.email;
  passwordInput.value = DEMO_CREDENTIALS.password;
  passwordInput.focus();
});

initFormValidation(passwordForm, announcer);

/** 已登入的人打開登入頁，直接回到原本要去的頁面。 */
async function init(): Promise<void> {
  try {
    await fetchCurrentAccount({ signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
    goNext();
    return;
  } catch (error) {
    if (!isUnauthorized(error)) {
      setStatus(authErrorMessage(error), "error");
      return;
    }
  }
  const reason = parseLoginReason(params.get("reason"));
  const message = loginReasonMessage(reason);
  if (message) setStatus(message, reason === "expired" ? "error" : "info");
}

void init();
