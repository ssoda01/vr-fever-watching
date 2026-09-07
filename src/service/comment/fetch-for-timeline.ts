import type { Context } from "koishi";
import type { TimelineEntry } from "../drawer/types";
import { EActivityType } from "../timeline";
import { CONSTANTS } from "../../util/constants";
import { getWeiboCommentsByWeiboID } from "../weibo";
import { filterCommentsWithinMinutes } from "./filter";

/** 为时间线中的原创/转发微博批量拉取评论并写回 entry */
export const attachCommentsToEntries = async (
  ctx: Context,
  entryByUID: Map<string, TimelineEntry | null>,
  minutes: number,
) => {
  const tasks: { weiboUID: string; weiboID: string }[] = [];

  for (const [weiboUID, entry] of entryByUID) {
    if (!entry?.timeline) continue;
    for (const item of entry.timeline) {
      if (item.activityType !== EActivityType.like) {
        tasks.push({ weiboUID, weiboID: String(item.id) });
      }
    }
  }

  if (!tasks.length) return;

  const results = await Promise.all(
    tasks.map(async ({ weiboUID, weiboID }) => {
      try {
        const result = await getWeiboCommentsByWeiboID(weiboID, weiboUID, ctx, {
          count: CONSTANTS.MAX_RENDER_COMMENTS,
        });
        const comments = filterCommentsWithinMinutes(
          result?.comments ?? [],
          minutes,
        );
        return { weiboID, comments };
      } catch (error) {
        ctx.logger.error(
          `[weibo api] 评论拉取失败 uid=${weiboUID} id=${weiboID} ${error instanceof Error ? error.message : String(error)}`,
        );
        return { weiboID, comments: [] };
      }
    }),
  );

  const commentsByPostId = new Map(
    results
      .filter((item) => item.comments.length > 0)
      .map((item) => [item.weiboID, item.comments]),
  );

  for (const entry of entryByUID.values()) {
    if (!entry?.timeline) continue;
    entry.timeline = entry.timeline.map((post) => {
      const comments = commentsByPostId.get(String(post.id));
      return comments?.length ? { ...post, comments } : post;
    });
  }
};
