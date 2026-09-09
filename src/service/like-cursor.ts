import type { Context } from "koishi";
import type { WeiboLikeCursor } from "../model";
import type { NormalizedPost } from "./timeline";

/** 读取某群对某博主的点赞推送游标 */
export const getLikeCursor = async (
  ctx: Context,
  weiboUID: string,
  groupID: string,
): Promise<WeiboLikeCursor | null> => {
  const rows = await ctx.database.get("weibo_like_cursors", {
    weiboUID,
    groupID,
  });
  return rows[0] ?? null;
};

/** 写入/更新最近点赞游标（lastLikeAt 仅备忘） */
export const upsertLikeCursor = async (
  ctx: Context,
  weiboUID: string,
  groupID: string,
  lastLikeId: string,
) => {
  await ctx.database.upsert("weibo_like_cursors", [
    {
      weiboUID,
      groupID,
      lastLikeId: String(lastLikeId),
      lastLikeAt: new Date(),
    },
  ]);
};

/**
 * 从按点赞时间倒序的列表中切出比 lastLikeId 更新的条目。
 * 无游标时不推送历史点赞，仅标记需种子化。
 */
export const takeNewerLikes = (
  likes: NormalizedPost[],
  lastLikeId: string | null | undefined,
): { newer: NormalizedPost[]; needSeed: boolean } => {
  if (!likes.length) {
    return { newer: [], needSeed: false };
  }

  if (!lastLikeId) {
    return { newer: [], needSeed: true };
  }

  const index = likes.findIndex(
    (post) => String(post.id) === String(lastLikeId),
  );
  if (index === -1) {
    // 游标已滚出当前页：当前页全部视为未推送
    return { newer: likes, needSeed: false };
  }
  if (index === 0) {
    return { newer: [], needSeed: false };
  }
  return { newer: likes.slice(0, index), needSeed: false };
};
