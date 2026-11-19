import "./style.css";
import "./ui/login.css";
import { authErrorMessage, loginReasonMessage } from "./auth/authMessages.ts";
import { HOME_PATH, LOGIN_PATH, parseLoginReason, safeNextPath } from "./auth/redirect.ts";
import { AuthConfigError, getSupabase } from "./auth/supabaseClient.ts";
import { escapeHtml } from "./ui/html.ts";
import { initFormValidation } from "./ui/formValidation.ts";

function requireElement<T extends Element>(selector: string, type: { new (): T }): T {
  const element = document.querySelector(selector);
  if (!(element instanceof type)) throw new Error(`Missing required element: ${selector}`);
  return element;
}

const passwordForm = requireElement("#password-form", HTMLFormElement);
const magicForm = requireElement("#magic-form", HTMLFormElement);
const emailInput = requireElement("#email", HTMLInputElement);
const passwordInput = requireElement("#password", HTMLInputElement);
const magicEmailInput = requireElement("#magic-email", HTMLInputElement);
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

function setBusy(form: HTMLFormElement, busy: boolean): void {
  form.setAttribute("aria-busy", String(busy));
  form.querySelectorAll("button").forEach((button) => {
    button.disabled = busy;
  });
}

function goNext(): void {
  window.location.replace(nextPath);
}

/** Magic Link 回來的網址帶著 ?code=，換完 session 後把它從網址列移除。 */
function cleanAuthParams(): void {
  if (!params.has("code") && !params.has("error")) return;
  const url = new URL(window.location.href);
  ["code", "error", "error_code", "error_description"].forEach((key) =>
    url.searchParams.delete(key),
  );
  window.history.replaceState(null, "", url);
}

async function signInWithPassword(mode: "sign-in" | "sign-up"): Promise<void> {
  const supabase = getSupabase();
  const credentials = { email: emailInput.value.trim(), password: passwordInput.value };
  if (mode === "sign-in") {
    const { error } = await supabase.auth.signInWithPassword(credentials);
    if (error) throw error;
    goNext();
    return;
  }
  const { data, error } = await supabase.auth.signUp(credentials);
  if (error) throw error;
  if (data.session) {
    goNext();
    return;
  }
  // 需要驗證信箱時不會立即拿到 session
  passwordForm.reset();
  setStatus("帳號已建立，請到信箱點擊驗證連結後再登入。", "success");
}

passwordForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const mode =
    event.submitter instanceof HTMLButtonElement && event.submitter.value === "sign-up"
      ? "sign-up"
      : "sign-in";
  setBusy(passwordForm, true);
  setStatus(mode === "sign-up" ? "正在建立帳號…" : "登入中…");
  signInWithPassword(mode)
    .catch((error: unknown) => {
      passwordInput.value = "";
      setStatus(authErrorMessage(error), "error");
    })
    .finally(() => setBusy(passwordForm, false));
});

magicForm.addEventListener("submit", (event) => {
  event.preventDefault();
  setBusy(magicForm, true);
  setStatus("正在寄送登入連結…");
  const redirect = new URL(LOGIN_PATH, window.location.origin);
  if (nextPath !== HOME_PATH) redirect.searchParams.set("next", nextPath);
  getSupabase()
    .auth.signInWithOtp({
      email: magicEmailInput.value.trim(),
      options: { emailRedirectTo: redirect.toString(), shouldCreateUser: true },
    })
    .then(({ error }) => {
      if (error) throw error;
      // 不論信箱是否已註冊都顯示相同訊息，避免被用來探測帳號是否存在
      setStatus(
        "如果這個 Email 可以登入，登入連結已寄出，請在同一個瀏覽器開啟信中的連結。",
        "success",
      );
    })
    .catch((error: unknown) => setStatus(authErrorMessage(error), "error"))
    .finally(() => setBusy(magicForm, false));
});

initFormValidation(passwordForm, announcer);
initFormValidation(magicForm, announcer);

async function init(): Promise<void> {
  let supabase;
  try {
    supabase = getSupabase();
  } catch (error) {
    if (error instanceof AuthConfigError) {
      setStatus(
        "尚未設定 Supabase：請在 .env 填入 VITE_SUPABASE_URL 與 VITE_SUPABASE_PUBLISHABLE_KEY。",
        "error",
      );
      [passwordForm, magicForm].forEach((form) => setBusy(form, true));
      return;
    }
    throw error;
  }
  const returnedFromLink = params.has("code") || params.has("error");
  // initialize 會先處理 Magic Link 帶回來的 code（PKCE 交換）
  const { error: linkError } = await supabase.auth.initialize();
  const { data } = await supabase.auth.getSession();
  cleanAuthParams();
  if (data.session) {
    goNext();
    return;
  }
  if (returnedFromLink && (linkError || params.has("error"))) {
    setStatus(
      authErrorMessage(linkError ?? { code: params.get("error_code") ?? "otp_expired" }),
      "error",
    );
    return;
  }
  const reasonMessage = loginReasonMessage(parseLoginReason(params.get("reason")));
  if (reasonMessage)
    setStatus(reasonMessage, params.get("reason") === "expired" ? "error" : "info");
}

void init();
