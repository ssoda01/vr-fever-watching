import { Context } from "koishi";
import { normalizeComments } from "../comment/normalizer";
import type { WeiboCommentsResult } from "../comment/types";
import { createWeiboHttp, requestWeiboApi } from "./http";

/** 拉取指定 UID 的微博主页、时间线与点赞列表 */
export const getWeiboByUID = async (weiboUID: string, ctx: Context) => {
  const weiboHttp = await createWeiboHttp(
    ctx,
    `https://weibo.com/u/${weiboUID}`,
  );
  if (!weiboHttp) {
    return null;
  }

  const profilePath = `/ajax/profile/info?uid=${weiboUID}&scene=profile`;
  const fetchProfile = async () => {
    const res = await requestWeiboApi(
      ctx,
      weiboHttp,
      profilePath,
      `profile uid=${weiboUID}`,
    );
    return res?.data || null;
  };

  let profile = await fetchProfile();
  if (!profile) {
    ctx.logger.warn(`[weibo api] profile 首次失败，正在重试 uid=${weiboUID}`);
    profile = await fetchProfile();
  }

  const timelineRes = await requestWeiboApi(
    ctx,
    weiboHttp,
    `/ajax/statuses/mymblog?uid=${weiboUID}&page=1&feature=0`,
    `timeline uid=${weiboUID}`,
  );
  const timeline = timelineRes?.data || null;

  const likeRes = await requestWeiboApi(
    ctx,
    weiboHttp,
    `/ajax/statuses/likelist?uid=${weiboUID}&page=1&with_total=true`,
    `like uid=${weiboUID}`,
  );
  const like = likeRes?.data || null;

  return { profile, timeline, like };
};

export interface GetWeiboCommentsOptions {
  count?: number;
  maxId?: string;
}

/** 拉取指定微博（原创/转发）的评论列表 */
export const getWeiboCommentsByWeiboID = async (
  weiboID: string,
  weiboUID: string,
  ctx: Context,
  options: GetWeiboCommentsOptions = {},
): Promise<WeiboCommentsResult | null> => {
  const count = options.count ?? 20;
  const weiboHttp = await createWeiboHttp(
    ctx,
    `https://weibo.com/${weiboUID}/${weiboID}`,
  );
  if (!weiboHttp) {
    return null;
  }

  const params = new URLSearchParams({
    is_reload: "1",
    id: weiboID,
    is_show_bulletin: "2",
    is_mix: "0",
    count: String(count),
    type: "feed",
    uid: weiboUID,
    fetch_level: "0",
    locale: "zh-CN",
  });
  if (options.maxId) {
    params.set("max_id", options.maxId);
  }

  const path = `/ajax/statuses/buildComments?${params.toString()}`;
  const response = await requestWeiboApi(
    ctx,
    weiboHttp,
    path,
    `comments uid=${weiboUID} id=${weiboID}`,
  );

  if (!response) {
    return null;
  }

  const comments = normalizeComments(response);
  const maxId = response?.max_id;
  const total = response?.total_number ?? comments.length;

  return {
    comments,
    total: Number(total) || comments.length,
    maxId: maxId != null ? String(maxId) : null,
  };
};
