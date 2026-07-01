import { Context, Session } from "koishi";
import { writeFile } from "node:fs/promises";
import { normalizeComments } from "./comment/normalizer";
import type { WeiboCommentsResult } from "./comment/types";
import { createWeiboHttp } from "./weibo-http";

/** 拉取指定 UID 的微博主页、时间线与点赞列表 */
export const getWeiboByUID = async (
  weiboUID: string,
  ctx: Context,
  _session?: Session,
) => {
  const weiboHttp = await createWeiboHttp(
    ctx,
    `https://weibo.com/u/${weiboUID}`,
  );
  if (!weiboHttp) {
    return null;
  }

  const profilePath = `/ajax/profile/info?uid=${weiboUID}&scene=profile`;
  const fetchProfile = () =>
    weiboHttp
      .get(profilePath)
      .then((res: any) => res?.data || null);

  let profile;
  try {
    profile = await fetchProfile();
  } catch {
    profile = await fetchProfile();
  }

  const timeline = await weiboHttp
    .get(`/ajax/statuses/mymblog?uid=${weiboUID}&page=1&feature=0`)
    .then((res: any) => res?.data || null);

  const like = await weiboHttp
    .get(`/ajax/statuses/likelist?uid=${weiboUID}&page=1&with_total=true`)
    .then((res: any) => res?.data || null);

  await Promise.all([
    writeFile("profile.json", JSON.stringify(profile, null, 2), "utf-8"),
    writeFile("timeline.json", JSON.stringify(timeline, null, 2), "utf-8"),
    writeFile("like.json", JSON.stringify(like, null, 2), "utf-8"),
  ]);

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

  const response = await weiboHttp
    .get(`/ajax/statuses/buildComments?${params.toString()}`)
    .then((res: any) => res ?? null);

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
