const WEIBO_DATE_REGEX =
  /(\w+) (\w+) (\d+) (\d+):(\d+):(\d+) ([+-]\d{4}) (\d{4})/;

const MONTH_MAP: Record<string, number> = {
  Jan: 0,
  Feb: 1,
  Mar: 2,
  Apr: 3,
  May: 4,
  Jun: 5,
  Jul: 6,
  Aug: 7,
  Sep: 8,
  Oct: 9,
  Nov: 10,
  Dec: 11,
};

/** 解析微博 created_at，如 Sun May 24 23:55:38 +0800 2026 */
export const parseWeiboDateString = (dateString: string): Date | null => {
  if (!dateString) return null;

  const match = dateString.match(WEIBO_DATE_REGEX);
  if (!match) return null;

  const [, , month, day, hour, minute, second, timezone, year] = match;
  const monthIndex = MONTH_MAP[month];
  if (monthIndex === undefined) return null;

  const date = new Date(
    Date.UTC(+year, monthIndex, +day, +hour, +minute, +second),
  );

  const timezoneOffsetHours = parseInt(timezone.slice(0, 3), 10);
  const timezoneOffsetMinutes = parseInt(
    timezone.slice(0, 1) + timezone.slice(3),
    10,
  );
  const timezoneOffset = timezoneOffsetHours * 60 + timezoneOffsetMinutes;
  date.setUTCMinutes(date.getUTCMinutes() - timezoneOffset);

  return date;
};

export const formatWeiboDate = (date: Date): string => {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

export const formatWeiboDateString = (dateString: string): string => {
  const date = parseWeiboDateString(dateString);
  return date ? formatWeiboDate(date) : dateString;
};

export interface WeiboPicInfo {
  large?: { url?: string };
  bmiddle?: { url?: string };
  original?: { url?: string };
  largest?: { url?: string };
}

export type WeiboPicInfos = Record<string, WeiboPicInfo>;

export interface NormalizedPostPageInfo {
  type: string;
  page_id: string;
  object_type: string;
  page_desc: string;
  page_title: string;
  page_icon: string;
  page_url: string;
  object_id: string;
  page_pic?: string;
}

/** 缩略图，仅用于对清晰度要求不高的场景 */
export const getThumbPicUrlFromInfo = (picInfo?: WeiboPicInfo): string =>
  picInfo?.bmiddle?.url ||
  picInfo?.large?.url ||
  picInfo?.original?.url ||
  picInfo?.largest?.url ||
  "";

/** 渲染用高清图：优先 largest / original / large */
export const getPicUrlFromInfo = (picInfo?: WeiboPicInfo): string =>
  picInfo?.largest?.url ||
  picInfo?.original?.url ||
  picInfo?.large?.url ||
  picInfo?.bmiddle?.url ||
  "";

export const getPostPicUrls = (
  picIds: string[] | undefined,
  picInfos: WeiboPicInfos | undefined,
  limit = 9,
): string[] =>
  (picIds || [])
    .slice(0, limit)
    .map((picId) => getPicUrlFromInfo(picInfos?.[picId]))
    .filter(Boolean);

export const countPostPics = (picIds: string[] | undefined): number =>
  (picIds || []).length;

export const getPageCoverUrl = (pageInfo?: NormalizedPostPageInfo): string =>
  pageInfo?.page_pic || pageInfo?.page_icon || "";

export type ActivityType = "original" | "retweet" | "like";

export interface NormalizedRetweetedPost {
  text: string;
  createdAt: string;
  createdAtText: string;
  user?: Record<string, any>;
  region_name?: string;
  source?: string;
  page_info?: NormalizedPostPageInfo;
  pic_ids?: string[];
  pic_infos?: WeiboPicInfos;
  reposts_count?: number;
  comments_count?: number;
  attitudes_count?: number;
}

export interface NormalizedPost {
  id: number | string;
  text: string;
  createdAt: string;
  createdAtTime: number | null;
  createdAtText: string;
  /** 用于时间轴排序的活动时间（点赞为估算值） */
  activityAtTime: number | null;
  activityType: ActivityType;
  url: string;
  user?: Record<string, any>;
  retweeted?: NormalizedRetweetedPost;
  retweeted_count?: number;
  reposts_count?: number;
  attitudes_count?: number;
  comments_count?: number;
  likes_count?: number;
  region_name?: string;
  post?: string;
  source?: string;
  page_info?: NormalizedPostPageInfo;
  pic_ids?: string[];
  pic_infos?: WeiboPicInfos;
}

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
  // 最近一条点赞：API 无点赞时间，用该博发布时间作为下限估计
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
