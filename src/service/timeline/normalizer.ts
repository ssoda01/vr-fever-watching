import { formatWeiboDate, parseWeiboDateString } from "../../util/weibo-date";
import type { ActivityType, NormalizedPost, NormalizedRetweetedPost } from "./types";

/** mymblog 中由主页插入的点赞条目（非用户本人发的微博） */
export const isTimelineLikedInsert = (post: any): boolean =>
  post?.analysis_extra?.includes("like_status") ||
  /赞过的微博/.test(post?.title?.text ?? "");

export const isRetweetPost = (post: any): boolean =>
  Boolean(post?.retweeted_status);

const normalizeRetweetedStatus = (
  retweeted: any,
): NormalizedRetweetedPost | undefined => {
  if (!retweeted) return undefined;

  const createdAt = retweeted?.created_at || "";
  const createdAtDate = parseWeiboDateString(createdAt);

  return {
    text: retweeted?.text_raw || "",
    createdAt,
    createdAtText: createdAtDate ? formatWeiboDate(createdAtDate) : createdAt,
    user: retweeted?.user,
    region_name: retweeted?.region_name,
    source: retweeted?.source,
    page_info: retweeted?.page_info,
    pic_ids: retweeted?.pic_ids,
    pic_infos: retweeted?.pic_infos,
    reposts_count: retweeted?.reposts_count,
    comments_count: retweeted?.comments_count,
    attitudes_count: retweeted?.attitudes_count,
  };
};

const normalizeRawPost = (
  post: any,
  activity: Pick<NormalizedPost, "activityType" | "activityAtTime">,
): NormalizedPost => {
  const createdAt = post?.created_at || "";
  const createdAtDate = parseWeiboDateString(createdAt);
  const createdAtTime = createdAtDate?.getTime() ?? null;

  return {
    id: post?.id,
    text: post?.text_raw || "",
    createdAt,
    createdAtTime,
    createdAtText: createdAtDate ? formatWeiboDate(createdAtDate) : createdAt,
    activityAtTime: activity.activityAtTime,
    activityType: activity.activityType,
    url: `https://m.weibo.cn/status/${post?.mid || post?.id || ""}`,
    user: post?.user,
    retweeted: normalizeRetweetedStatus(post?.retweeted_status),
    retweeted_count: post?.retweeted_count,
    comments_count: post?.comments_count,
    likes_count: post?.likes_count,
    reposts_count: post?.reposts_count,
    attitudes_count: post?.attitudes_count,
    region_name: post?.region_name,
    source: post?.source,
    page_info: post?.page_info,
    pic_ids: post?.pic_ids,
    pic_infos: post?.pic_infos,
  };
};

/**
 * likelist 按点赞时间倒序，但条目不含精确点赞时间戳。
 * 在 likelist 内按序号，于 [最新博文发布时间, 最早博文发布时间] 间插值，
 * 再与当前博文发布时间取较大值（点赞不会早于原博发布）。
 */
const estimateLikeActivityTime = (
  index: number,
  total: number,
  postCreatedAt: number | null,
  rangeMin: number,
  rangeMax: number,
): number => {
  if (index === 0 || total <= 1) {
    return postCreatedAt ?? rangeMax;
  }

  const ratio = index / (total - 1);
  const estimated = rangeMax - ratio * (rangeMax - rangeMin);
  return Math.max(postCreatedAt ?? 0, estimated);
};

/** 从 mymblog 提取本人原创与转发（排除主页插入的点赞条目） */
export const normalizeMymblogTimeline = (
  timeline: any,
  uid: string | number,
): NormalizedPost[] => {
  const uidStr = String(uid);
  const list = (timeline?.list || []).filter(
    (post: any) =>
      !isTimelineLikedInsert(post) && String(post?.user?.id) === uidStr,
  );

  return list.map((post: any) => {
    const createdAtTime =
      parseWeiboDateString(post?.created_at || "")?.getTime() ?? null;
    const isRetweet = isRetweetPost(post);

    return normalizeRawPost(post, {
      activityType: isRetweet ? "retweet" : "original",
      activityAtTime: createdAtTime,
    });
  });
};

/** 从 likelist 提取点赞微博 */
export const normalizeLikeList = (likeList: any): NormalizedPost[] => {
  const list = likeList?.list || [];
  if (!list.length) return [];

  const createdTimes = list
    .map(
      (post: any) =>
        parseWeiboDateString(post?.created_at || "")?.getTime() ?? null,
    )
    .filter((time: number | null): time is number => time !== null);

  const rangeMin = createdTimes.length ? Math.min(...createdTimes) : Date.now();
  const rangeMax = createdTimes.length ? Math.max(...createdTimes) : rangeMin;

  return list.map((post: any, index: number) => {
    const createdAtTime =
      parseWeiboDateString(post?.created_at || "")?.getTime() ?? null;

    return normalizeRawPost(post, {
      activityType: "like",
      activityAtTime: estimateLikeActivityTime(
        index,
        list.length,
        createdAtTime,
        rangeMin,
        rangeMax,
      ),
    });
  });
};

/**
 * 合并最近原创、最近转发（mymblog）与最近点赞（likelist），按活动时间倒序排列。
 */
export const mergeActivityTimeline = (
  timeline: any,
  likeList: any,
  uid: string | number,
): NormalizedPost[] => {
  const ownPosts = normalizeMymblogTimeline(timeline, uid);
  const likes = normalizeLikeList(likeList);

  return [...ownPosts, ...likes].sort(
    (a, b) => (b.activityAtTime ?? 0) - (a.activityAtTime ?? 0),
  );
};

/** @deprecated 请使用 mergeActivityTimeline */
export const normalizeTimeline = (timeline: any): NormalizedPost[] => {
  const list = timeline?.list || [];
  return list.map((post: any) => {
    const createdAtTime =
      parseWeiboDateString(post?.created_at || "")?.getTime() ?? null;
    const activityType: ActivityType = isTimelineLikedInsert(post)
      ? "like"
      : isRetweetPost(post)
        ? "retweet"
        : "original";

    return normalizeRawPost(post, {
      activityType,
      activityAtTime: createdAtTime,
    });
  });
};

/** 判断微博活动是否在指定分钟数内 */
export const isWithinMinutes = (
  post: Pick<NormalizedPost, "activityAtTime" | "createdAtTime">,
  minutes: number,
): boolean => {
  const time = post.activityAtTime ?? post.createdAtTime;
  if (!time) return false;
  const windowMs = minutes > 0 ? minutes * 60 * 1000 : 60000;
  return time >= Date.now() - windowMs;
};

/** 保留指定分钟数内的微博活动 */
export const filterTimelineWithinMinutes = (
  timeline: NormalizedPost[],
  minutes: number,
): NormalizedPost[] =>
  timeline.filter((post) => isWithinMinutes(post, minutes));
