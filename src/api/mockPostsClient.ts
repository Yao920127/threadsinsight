/** `/api/mock-posts`：即時產生的合成資料報告（不寫入資料庫）。 */
import type { CleanDataset } from "./types.ts";
import { requestEnvelope, type RequestOptions } from "./envelope.ts";
import { isCleanDataset } from "./validators.ts";

export { ApiError, isUnauthorized, type ApiErrorKind } from "./envelope.ts";
export type FetchMockPostsOptions = RequestOptions;

export function fetchMockPosts(
  username: string,
  count: number,
  options: FetchMockPostsOptions = {},
): Promise<CleanDataset> {
  const query = new URLSearchParams({ username, count: String(count) });
  return requestEnvelope(
    {
      path: `/api/mock-posts?${query}`,
      validate: isCleanDataset,
      invalidMessage: "Payload is not a synthetic mock dataset",
    },
    options,
  );
}
