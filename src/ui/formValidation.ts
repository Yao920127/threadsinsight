/**
 * 讓 ARIA 狀態與 CSS `:user-invalid` 同步：只有使用者互動過或送出後才標示錯誤，
 * 錯誤訊息只在欄位無效時才列進 aria-describedby，並由單一 polite live region 播報。
 */

const ANNOUNCE_DELAY_MS = 500;
const FIELD_SELECTOR = "input, select, textarea";

type Field = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

function isField(target: EventTarget | null): target is Field {
  return target instanceof Element && target.matches(FIELD_SELECTOR);
}

function linkError(field: Field, shown: boolean): void {
  const errorId = field.dataset.error;
  if (!errorId) return;
  const ids = (field.getAttribute("aria-describedby") ?? "")
    .split(/\s+/)
    .filter((id) => id && id !== errorId);
  const next = shown ? [...ids, errorId] : ids;
  if (next.length > 0) field.setAttribute("aria-describedby", next.join(" "));
  else field.removeAttribute("aria-describedby");
}

function spokenText(node: Element): string {
  const copy = node.cloneNode(true) as Element;
  copy.querySelectorAll('[aria-hidden="true"]').forEach((n) => n.remove());
  copy
    .querySelectorAll("[role='img'][aria-label]")
    .forEach((n) => n.replaceWith(`${n.getAttribute("aria-label")}：`));
  return (copy.textContent ?? "").replace(/\s+/g, " ").trim();
}

export function initFormValidation(form: HTMLFormElement, announcer: HTMLElement): void {
  const flagged = new WeakSet<Field>();
  const announced = new WeakSet<Field>();
  let announceTimer: number | undefined;
  let announcedField: Field | null = null;

  const announceError = (field: Field): void => {
    const error = field.dataset.error ? document.getElementById(field.dataset.error) : null;
    if (!error) return;
    const label = field.labels?.[0] ? `${spokenText(field.labels[0])}：` : "";
    window.clearTimeout(announceTimer);
    announcer.textContent = "";
    announcedField = field;
    announceTimer = window.setTimeout(() => {
      announcer.textContent = label + spokenText(error);
    }, ANNOUNCE_DELAY_MS);
  };

  const syncAria = (field: Field, announce = false): void => {
    if (field.matches(":user-invalid")) {
      if (announce && !announced.has(field)) {
        announceError(field);
        announced.add(field);
      }
      field.setAttribute("aria-invalid", "true");
      linkError(field, true);
      flagged.add(field);
      return;
    }
    if (flagged.has(field) || field.getAttribute("aria-invalid") !== "true") {
      field.setAttribute("aria-invalid", "false");
      linkError(field, false);
      flagged.delete(field);
      announced.delete(field);
      if (announcedField === field) {
        window.clearTimeout(announceTimer);
        announcer.textContent = "";
      }
    }
  };

  form.querySelectorAll<Field>(FIELD_SELECTOR).forEach((field) => syncAria(field));
  form.addEventListener("blur", (e) => isField(e.target) && syncAria(e.target, true), true);
  form.addEventListener("change", (e) => isField(e.target) && syncAria(e.target, true), true);
  form.addEventListener("input", (e) => {
    if (isField(e.target) && e.target.hasAttribute("aria-invalid")) syncAria(e.target);
  });
  // reset 事件在表單實際重設「之前」觸發；重設後 :user-invalid 會清除，延後一輪再同步 ARIA
  form.addEventListener("reset", () => {
    window.setTimeout(() => {
      form.querySelectorAll<Field>(FIELD_SELECTOR).forEach((field) => syncAria(field));
    }, 0);
  });
  // 送出失敗時瀏覽器會聚焦第一個無效欄位並唸出錯誤，因此不重複播報
  form.addEventListener(
    "invalid",
    (e) => {
      if (!isField(e.target)) return;
      announced.add(e.target);
      syncAria(e.target);
    },
    true,
  );
}
