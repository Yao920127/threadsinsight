/** 「全部貼文」清單：每篇合成貼文的完整內容與各項指標。所有動態文字都經過 escapeHtml。 */
import { engagementOf, GROUP_LABELS, type GroupedPost } from "../analysis/metrics.ts";
import { TOPIC_LABELS } from "./attributionSection.ts";
import { POST_TYPE_LABELS } from "./segmentCharts.ts";
import { escapeHtml, formatNumber, formatPercent, formatPublishedAt } from "./html.ts";

export const ALL_POSTS_ID = "all-posts";

function renderMetric(label: string, value: string, muted = false): string {
  return `
    <div class="post-metric${muted ? " is-muted" : ""}">
      <dt>${escapeHtml(label)}</dt>
      <dd>${escapeHtml(value)}</dd>
    </div>`;
}

function renderPostCard(post: GroupedPost, index: number): string {
  const number = index + 1;
  const titleId = `post-${number}-title`;
  const views = post.views_count;
  const rate = views === null || views === 0 ? null : engagementOf(post) / views;

  return `
    <li>
      <article class="post-card" aria-labelledby="${titleId}">
        <header class="post-head">
          <h3 id="${titleId}" class="post-number">#${number}</h3>
          <time class="post-time" datetime="${escapeHtml(post.published_at)}">${escapeHtml(formatPublishedAt(post.published_at))}</time>
          <span class="post-tags">
            <span class="tag">${POST_TYPE_LABELS[post.post_type]}</span>
            <span class="tag">${TOPIC_LABELS[post.topic]}</span>
            <span class="tag tag-${post.engagement_group}">${GROUP_LABELS[post.engagement_group]}</span>
          </span>
        </header>
        <p class="post-content">${escapeHtml(post.content)}</p>
        <dl class="post-metrics">
          ${renderMetric("讚", formatNumber(post.likes_count))}
          ${renderMetric("回覆", formatNumber(post.replies_count))}
          ${renderMetric("轉發", formatNumber(post.reposts_count))}
          ${renderMetric("瀏覽", views === null ? "未公開" : formatNumber(views), views === null)}
          ${renderMetric("互動率", formatPercent(rate), rate === null)}
        </dl>
        <footer class="post-foot">
          <code class="post-url">${escapeHtml(post.post_url)}</code>
        </footer>
      </article>
    </li>`;
}

export function renderAllPosts(posts: readonly GroupedPost[]): string {
  return `
    <section id="${ALL_POSTS_ID}" class="report-section all-posts" aria-labelledby="all-posts-title">
      <div class="section-head">
        <h2 id="all-posts-title" class="section-title">全部貼文（${posts.length} 篇）</h2>
        <p class="footnote">依發文時間由新到舊排列。互動率 =（讚 + 回覆 + 轉發）÷ 瀏覽數。</p>
      </div>
      <ol class="post-list">${posts.map(renderPostCard).join("")}</ol>
    </section>`;
}
