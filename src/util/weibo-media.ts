import type {
  NormalizedPostPageInfo,
  WeiboPicInfo,
  WeiboPicInfos,
} from "../service/timeline/types";

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
