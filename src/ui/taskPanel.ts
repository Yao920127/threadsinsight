/** 任務列表的互動：事件委派處理按鈕，刪除前以 <dialog> 確認（PRD F2「確認彈窗」）。 */
import type { AnalysisTask } from "../api/tasks.ts";
import { parseTaskAction, renderTaskList, type TaskAction } from "./taskList.ts";

export interface TaskPanelElements {
  readonly list: HTMLElement;
  readonly dialog: HTMLDialogElement;
  readonly dialogText: HTMLElement;
}

export type TaskActionHandler = (action: TaskAction, task: AnalysisTask) => void;

export interface TaskPanel {
  render(tasks: readonly AnalysisTask[], activeId: string | null): void;
  setBusy(busy: boolean): void;
}

function confirmDelete(elements: TaskPanelElements, task: AnalysisTask): Promise<boolean> {
  const { dialog, dialogText } = elements;
  dialogText.textContent = `將刪除 @${task.target_username}（${task.requested_count} 篇）的分析任務，以及它的所有貼文與報告，刪除後無法復原。`;
  dialog.returnValue = "";
  dialog.showModal();
  return new Promise((resolve) => {
    dialog.addEventListener("close", () => resolve(dialog.returnValue === "confirm"), {
      once: true,
    });
  });
}

export function initTaskPanel(elements: TaskPanelElements, onAction: TaskActionHandler): TaskPanel {
  let tasks: readonly AnalysisTask[] = [];

  elements.list.addEventListener("click", (event) => {
    const button =
      event.target instanceof Element ? event.target.closest("[data-task-action]") : null;
    if (!(button instanceof HTMLButtonElement)) return;
    const action = parseTaskAction(button.dataset.taskAction);
    const id = button.closest<HTMLElement>("[data-task-id]")?.dataset.taskId;
    const task = tasks.find((t) => t.id === id);
    if (action === null || task === undefined) return;
    if (action !== "delete") {
      onAction(action, task);
      return;
    }
    void confirmDelete(elements, task).then((confirmed) => {
      if (confirmed) onAction("delete", task);
      else button.focus(); // 取消後回到原本的按鈕
    });
  });

  return {
    render(next, activeId) {
      tasks = next;
      elements.list.innerHTML = renderTaskList(next, activeId);
    },
    setBusy(busy) {
      elements.list.setAttribute("aria-busy", String(busy));
      elements.list.querySelectorAll("button").forEach((button) => {
        button.disabled = busy;
      });
    },
  };
}
