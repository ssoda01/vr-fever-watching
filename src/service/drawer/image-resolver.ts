import { Context } from "koishi";
import { CONSTANTS } from "../../util/constants";
import { loadCookieStringFromDatabase } from "../../util/puppeteer-cookie";
import {
  countPostPics,
  getPageCoverUrl,
  getPostPicUrls,
} from "../../util/weibo-media";
import type { NormalizedPost } from "../timeline/types";
import type { NormalizedComment } from "../comment/types";
import type {
  ImageBudget,
  ProfileData,
  ResolvedComment,
  ResolvedMediaPost,
} from "./types";

const PLACEHOLDER_IMAGE =
  "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxMDAiIGhlaWdodD0iMTAwIiB2aWV3Qm94PSIwIDAgMTAwIDEwMCI+PHJlY3Qgd2lkdGg9IjEwMCIgaGVpZ2h0PSIxMDAiIGZpbGw9IiNlZWVmMiIvPjx0ZXh0IHg9IjUwIiB5PSI1NSIgZm9udC1zaXplPSIxNCIgZmlsbD0iIzk4YTNhZiIgdGV4dC1hbmNob3I9Im1pZGRsZSI+8J+OiTwvdGV4dD48L3N2Zz4=";

export const normalizeImageUrl = (url: string) => {
  if (!url) return "";
  if (url.startsWith("//")) return `https:${url}`;
  return url;
};

const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

/** 用户主页头图：取 cover_image_phone 分号分隔后的第一张 */
export const getProfileCoverUrl = (coverImagePhone?: string) => {
  if (!coverImagePhone) return "";
  const first = coverImagePhone
    .split(";")
    .map((item) => item.trim())
    .find(Boolean);
  return first ? normalizeImageUrl(first) : "";
};

const takePostImageUrls = (
  picIds: string[] | undefined,
  picInfos: NormalizedPost["pic_infos"],
  budget: ImageBudget,
) => {
  const total = countPostPics(picIds);
  const limit = Math.min(CONSTANTS.MAX_POST_IMAGES, budget.remaining);
  const urls = getPostPicUrls(picIds, picInfos, limit)
    .map((url) => normalizeImageUrl(url))
    .filter(Boolean);
  budget.remaining -= urls.length;
  return {
    urls,
    hidden: Math.max(total - urls.length, 0),
  };
};

const fetchImageAsDataUrl = async (
  ctx: Context,
  url: string,
  cookieString: string | null,
  referer = "https://weibo.com/",
): Promise<string | null> => {
  const normalizedUrl = normalizeImageUrl(url);
  if (!normalizedUrl || normalizedUrl.startsWith("data:")) return normalizedUrl;
  const referers = [referer, "https://weibo.com/", "https://www.weibo.com/"];
  for (const currentReferer of referers) {
    try {
      const response: any = await ctx.http.get(normalizedUrl, {
        responseType: "arraybuffer",
        headers: {
          ...(cookieString ? { cookie: cookieString } : {}),
          referer: currentReferer,
          "user-agent": CONSTANTS.USER_AGENT,
          accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
        },
      });
      const data = response?.data ?? response;
      const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data);
      const mimeType = String(
        response?.headers?.["content-type"] || "image/jpeg",
      ).split(";")[0];
      if (!buffer.length) continue;
      return `data:${mimeType};base64,${buffer.toString("base64")}`;
    } catch {
      continue;
    }
  }
  return null;
};

const resolveImageUrl = async (
  ctx: Context,
  url: string,
  cookieString: string | null,
  cache: Map<string, string>,
  referer = "https://weibo.com/",
) => {
  const normalizedUrl = normalizeImageUrl(url);
  if (!normalizedUrl) return "";
  if (cache.has(normalizedUrl)) return cache.get(normalizedUrl)!;
  const resolved =
    (await fetchImageAsDataUrl(ctx, normalizedUrl, cookieString, referer)) ||
    PLACEHOLDER_IMAGE;
  cache.set(normalizedUrl, resolved);
  if (CONSTANTS.IMAGE_FETCH_DELAY_MS > 0) {
    await sleep(CONSTANTS.IMAGE_FETCH_DELAY_MS);
  }
  return resolved;
};

export const prepareDrawerAssets = async (
  ctx: Context,
  profile: ProfileData,
  normalizedTimeline: NormalizedPost[],
) => {
  const cookieString = await loadCookieStringFromDatabase(ctx);
  const cache = new Map<string, string>();
  const user = profile?.user || {};
  const avatarUrl =
    user.avatar_hd || user.avatar_large || user.profile_image_url || "";
  const coverUrl = getProfileCoverUrl(user.cover_image_phone);

  const profileReferer =
    user.id || user.idstr
      ? `https://weibo.com/u/${user.id || user.idstr}`
      : "https://weibo.com/";

  const resolvedProfile: ProfileData = {
    user: {
      ...user,
      avatar_hd: await resolveImageUrl(
        ctx,
        avatarUrl,
        cookieString,
        cache,
        profileReferer,
      ),
      avatar_large: await resolveImageUrl(
        ctx,
        user.avatar_large || avatarUrl,
        cookieString,
        cache,
        profileReferer,
      ),
      profile_image_url: await resolveImageUrl(
        ctx,
        user.profile_image_url || avatarUrl,
        cookieString,
        cache,
        profileReferer,
      ),
      cover_image_phone: coverUrl
        ? await resolveImageUrl(
            ctx,
            coverUrl,
            cookieString,
            cache,
            profileReferer,
          )
        : "",
    },
  };

  const resolvePostMediaFrom = async (
    source: {
      pic_ids?: string[];
      pic_infos?: NormalizedPost["pic_infos"];
      page_info?: NormalizedPost["page_info"];
    },
    budget: ImageBudget,
  ) => {
    const images = takePostImageUrls(source.pic_ids, source.pic_infos, budget);
    const resolvedImages: string[] = [];
    for (const url of images.urls) {
      const image = await resolveImageUrl(
        ctx,
        url,
        cookieString,
        cache,
        profileReferer,
      );
      if (image) resolvedImages.push(image);
    }

    const coverRaw = getPageCoverUrl(source.page_info);
    const resolvedMediaCover = coverRaw
      ? await resolveImageUrl(
          ctx,
          coverRaw,
          cookieString,
          cache,
          profileReferer,
        )
      : undefined;

    return {
      resolvedImages,
      hiddenImageCount: images.hidden,
      resolvedMediaCover,
    };
  };

  const resolvedTimeline: ResolvedMediaPost[] = [];
  const imageBudget: ImageBudget = {
    remaining: CONSTANTS.MAX_TIMELINE_IMAGES,
  };

  for (const post of normalizedTimeline) {
    const postUser = post.user || {};
    const postAvatar =
      postUser.avatar_large || postUser.profile_image_url || avatarUrl;
    const retweeted = post.retweeted;
    const quotedUser = retweeted?.user || {};
    const quotedAvatar =
      quotedUser.avatar_large || quotedUser.profile_image_url || avatarUrl;
    const postMedia = await resolvePostMediaFrom(post, imageBudget);
    const postAvatarResolved = await resolveImageUrl(
      ctx,
      postAvatar,
      cookieString,
      cache,
      profileReferer,
    );

    const resolveCommentTree = async (
      comments: NormalizedComment[],
    ): Promise<ResolvedComment[]> =>
      Promise.all(
        comments.map(async (comment) => {
          const commentUser = comment.user || {};
          const commentAvatar =
            commentUser.avatar_large ||
            commentUser.profile_image_url ||
            postAvatar;
          const replies = comment.replies?.length
            ? await resolveCommentTree(comment.replies)
            : undefined;
          return {
            ...comment,
            resolvedAvatar: await resolveImageUrl(
              ctx,
              commentAvatar,
              cookieString,
              cache,
              profileReferer,
            ),
            replies,
          };
        }),
      );

    const resolvedComments = post.comments?.length
      ? await resolveCommentTree(post.comments)
      : undefined;

    resolvedTimeline.push({
      ...post,
      ...postMedia,
      comments: resolvedComments,
      user: {
        ...postUser,
        avatar_large: postAvatarResolved,
        profile_image_url: postAvatarResolved,
      },
      retweeted: retweeted
        ? {
            ...retweeted,
            ...(await resolvePostMediaFrom(retweeted, imageBudget)),
            user: {
              ...quotedUser,
              avatar_large: await resolveImageUrl(
                ctx,
                quotedAvatar,
                cookieString,
                cache,
                profileReferer,
              ),
              profile_image_url: await resolveImageUrl(
                ctx,
                quotedUser.profile_image_url || quotedAvatar,
                cookieString,
                cache,
                profileReferer,
              ),
            },
          }
        : undefined,
    });
  }

  return { profile: resolvedProfile, timeline: resolvedTimeline };
};
