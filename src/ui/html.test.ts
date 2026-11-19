import { describe, expect, test } from "vite-plus/test";
import { escapeHtml, formatPublishedAt, formatNumber, formatPercent } from "./html.ts";

describe("escapeHtml", () => {
  test("escapes characters that could break out of text or attributes", () => {
    expect(escapeHtml(`<img src=x onerror="alert('x')">&`)).toBe(
      "&lt;img src=x onerror=&quot;alert(&#39;x&#39;)&quot;&gt;&amp;",
    );
  });
});

describe("formatters", () => {
  test("formats numbers with zh-TW grouping", () => {
    expect(formatNumber(1234567)).toBe("1,234,567");
  });

  test("formats a rate as a percentage with one decimal", () => {
    expect(formatPercent(0.0345)).toBe("3.5%");
    expect(formatPercent(null)).toBe("—");
  });

  test("formats published_at as Taipei month/day, weekday and time", () => {
    expect(formatPublishedAt("2026-11-18T22:49:00+08:00")).toBe("11/18（三）22:49");
  });
});
