/** 在瀏覽器觸發文字檔下載（Blob + 暫時的 <a download>），不經伺服器。 */

export function downloadText(fileName: string, content: string, mimeType: string): void {
  const url = URL.createObjectURL(new Blob([content], { type: mimeType }));
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.hidden = true;
  document.body.append(link);
  try {
    link.click();
  } finally {
    link.remove();
    // 下一個工作週期再釋放，部分瀏覽器在 click 當下尚未開始讀取 Blob
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}
