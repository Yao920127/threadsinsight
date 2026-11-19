/**
 * 「三群組內容歸因」區塊（PRD F4 第 3 步、F5 三群組 NLP 成因對照卡片）。
 * 資料由 Python attribution.py 以規則計算；這裡只負責呈現。所有動態文字都經過 escapeHtml。
 */
import { GROUP_LABELS } from "../analysis/metrics.ts";
import type { GroupProfile, NlpAnalysis, TextStructure, Topic } from "../api/types.ts";
import { escapeHtml, formatNumber } from "./html.ts";
import { SMALL_SAMPLE_NOTE } from "./notes.ts";

export const TOPIC_LABELS: Record<Topic, string> = {
  career: "職場",
  life: "生活",
  tech: "科技",
  opinion: "觀點",
  other: "其他",
};

const METHOD_NOTE =
  "每組抽樣最多 5 篇代表性貼文（高互動取最高分、中互動取最接近中位數、低互動取最低分），" +
  "以相同的規則與詞典分析後與全部貼文比較。觀察屬相關性，不代表因果。";

const STRUCTURE_ITEMS: readonly (readonly [keyof TextStructure, string, "rate" | "number"])[] = [
  ["avg_char_count", "平均字數", "number"],
  ["question_rate", "含提問", "rate"],
  ["cta_rate", "邀請互動", "rate"],
  ["hashtag_rate", "用 hashtag", "rate"],
  ["link_rate", "附連結", "rate"],
  ["image_rate", "附圖片", "rate"],
  ["positive_rate", "語氣正向", "rate"],
];

export function topicLabel(key: string): string {
  return key in TOPIC_LABELS ? TOPIC_LABELS[key as Topic] : key;
}

function formatRate(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function renderStructure(structure: TextStructure): string {
  const items = STRUCTURE_ITEMS.map(
    ([field, label, kind]) => `
      <div>
        <dt>${escapeHtml(label)}</dt>
        <dd>${kind === "rate" ? formatRate(structure[field]) : formatNumber(structure[field])}</dd>
      </div>`,
  ).join("");
  return `<dl class="attr-structure">${items}</dl>`;
}

function renderKeywords(profile: GroupProfile): string {
  if (profile.keywords.length === 0) {
    return `<p class="footnote">沒有此組特有的詞（樣本的詞三組皆有）。</p>`;
  }
  const chips = profile.keywords
    .map((k) => `<li class="attr-chip">${escapeHtml(k.term)}</li>`)
    .join("");
  return `<ul class="attr-chips" aria-label="特有關鍵詞">${chips}</ul>`;
}

function renderTopics(profile: GroupProfile): string {
  const text = profile.topics
    .map(([topic, count]) => `${topicLabel(topic)} ${formatNumber(count)}`)
    .join("、");
  return `<p class="attr-topics"><span>主題組成</span>${escapeHtml(text || "—")}</p>`;
}

function renderGroupCard(profile: GroupProfile): string {
  const title = `${GROUP_LABELS[profile.group]}組`;
  const titleId = `attr-${profile.group}-title`;
  const meta = `共 ${formatNumber(profile.post_count)} 篇，抽樣 ${formatNumber(profile.sample_size)} 篇`;
  const body =
    profile.insufficient || profile.structure === null
      ? `<p class="attr-empty">樣本不足：此組沒有貼文，略過歸因。</p>`
      : `
        <section class="attr-block" aria-label="特有關鍵詞">
          <h4 class="attr-heading">特有關鍵詞（TF-IDF）</h4>
          ${renderKeywords(profile)}
        </section>
        <section class="attr-block" aria-label="結構特徵">
          <h4 class="attr-heading">結構特徵</h4>
          ${renderStructure(profile.structure)}
          ${renderTopics(profile)}
        </section>
        <section class="attr-block" aria-label="觀察">
          <h4 class="attr-heading">觀察</h4>
          <ul class="attr-observations">
            ${profile.observations.map((o) => `<li>${escapeHtml(o)}</li>`).join("")}
          </ul>
        </section>`;
  return `
    <article class="card attr-card attr-${profile.group}" aria-labelledby="${titleId}">
      <header class="attr-head">
        <h3 id="${titleId}" class="chart-title">${escapeHtml(title)}</h3>
        <p class="chart-unit">${escapeHtml(meta)}</p>
      </header>
      ${body}
    </article>`;
}

export function renderAttributionSection(nlp: NlpAnalysis, smallSample: boolean): string {
  const notes = [METHOD_NOTE, ...(smallSample ? [SMALL_SAMPLE_NOTE] : [])]
    .map((note) => `<p class="footnote">${escapeHtml(note)}</p>`)
    .join("");
  return `
    <section class="report-section" aria-labelledby="attribution-title">
      <div class="section-head">
        <h2 id="attribution-title" class="section-title">三群組內容歸因</h2>
        ${notes}
      </div>
      <div class="attr-grid">${nlp.groups.map(renderGroupCard).join("")}</div>
    </section>`;
}
