import { CONSTANTS } from "../../util/constants";
import { escapeHtml } from "../../util/html";
import { formatWeiboDate } from "../../util/weibo-date";
import { formatWeiboTextHtml } from "../../util/weibo-face";
import type { ActivityType, NormalizedPost, NormalizedRetweetedPost } from "../timeline/types";
import type { ProfileData, ResolvedComment, ResolvedMediaPost } from "./types";

const ACTIVITY_LABELS: Record<ActivityType, string> = {
  original: "最近原创",
  retweet: "最近转发",
  like: "最近赞过",
};

type FaceSrcMap = Record<string, string>;

const formatPostText = (text: string, faceSrc: FaceSrcMap) =>
  formatWeiboTextHtml(text, faceSrc);

const isMeaningfulRetweetComment = (text: string) =>
  Boolean(text?.trim()) && text.trim() !== "转发微博";
const buildPostImages = (urls: string[], hiddenCount = 0) => {
  if (!urls.length && hiddenCount <= 0) return "";
  const gridClass =
    urls.length === 1
      ? "post-images post-images--single"
      : "post-images post-images--grid";
  return `<div class="${gridClass}">
    ${urls
      .map(
        (url) => `<img class="post-image" src="${escapeHtml(url)}" alt="" />`,
      )
      .join("")}
    ${hiddenCount > 0 ? `<div class="post-images-more">还有 ${hiddenCount} 张图片未显示</div>` : ""}
  </div>`;
};

const buildMediaCard = (
  coverUrl: string | undefined,
  title: string | undefined,
) => {
  if (!coverUrl && !title) return "";
  if (!coverUrl) {
    return title
      ? `<div class="post-media-title">${escapeHtml(title)}</div>`
      : "";
  }

  return `<div class="post-media-card">
    <img class="post-media-cover" src="${escapeHtml(coverUrl)}" alt="" />
    ${title ? `<div class="post-media-title">${escapeHtml(title)}</div>` : ""}
  </div>`;
};

const buildPostMedia = (
  post: Pick<
    ResolvedMediaPost,
    | "pic_ids"
    | "pic_infos"
    | "page_info"
    | "resolvedImages"
    | "hiddenImageCount"
    | "resolvedMediaCover"
  >,
) => {
  const imageUrls = post.resolvedImages || [];
  const mediaCover = post.resolvedMediaCover;

  return `${buildMediaCard(mediaCover, post.page_info?.page_title)}
    ${buildPostImages(imageUrls, post.hiddenImageCount || 0)}`;
};

const buildQuotedPost = (
  retweeted: NormalizedRetweetedPost & {
    resolvedImages?: string[];
    resolvedMediaCover?: string;
  },
  fallbackAvatar: string,
  faceSrc: FaceSrcMap,
) => {
  const quotedUser = retweeted.user || {};
  const quotedAvatar =
    quotedUser.avatar_large || quotedUser.profile_image_url || fallbackAvatar;

  return `<div class="quoted-post">
    <div class="quoted-post-header">
      <img class="quoted-post-avatar" src="${escapeHtml(quotedAvatar)}" alt="" />
      <div class="quoted-post-meta">
        <div class="quoted-post-name">${escapeHtml(quotedUser.screen_name || "微博用户")}</div>
        <div class="quoted-post-time">${escapeHtml(retweeted.createdAtText || retweeted.createdAt || "")} ${escapeHtml(retweeted.source || "")} ${escapeHtml(retweeted.region_name || "")}</div>
      </div>
    </div>
    <div class="quoted-post-text">${formatPostText(retweeted.text, faceSrc)}</div>
    ${buildPostMedia(retweeted)}
  </div>`;
};

const buildCommentItem = (
  comment: ResolvedComment,
  fallbackAvatar: string,
  faceSrc: FaceSrcMap,
  nested = false,
): string => {
  const user = comment.user || {};
  const avatar =
    comment.resolvedAvatar ||
    user.avatar_large ||
    user.profile_image_url ||
    fallbackAvatar;
  const likes =
    comment.likesCount && comment.likesCount > 0
      ? `<span class="comment-likes">👍 ${comment.likesCount}</span>`
      : "";
  const authorBadge = comment.isAuthor
    ? `<span class="comment-author">博主</span>`
    : "";
  const replies = comment.replies?.length
    ? `<div class="comment-replies">${comment.replies
        .map((reply) => buildCommentItem(reply, fallbackAvatar, faceSrc, true))
        .join("")}</div>`
    : "";

  return `<div class="comment-item${nested ? " comment-item--reply" : ""}">
    <img class="comment-avatar" src="${escapeHtml(avatar)}" alt="" />
    <div class="comment-body">
      <div class="comment-meta">
        <span class="comment-name">${escapeHtml(user.screen_name || "微博用户")}</span>
        ${authorBadge}
        <span class="comment-time">${escapeHtml(comment.createdAtText || comment.createdAt || "")}</span>
        ${likes}
      </div>
      <div class="comment-text">${formatPostText(comment.text, faceSrc)}</div>
      ${replies}
    </div>
  </div>`;
};

const buildPostComments = (
  comments: ResolvedComment[] | undefined,
  fallbackAvatar: string,
  faceSrc: FaceSrcMap,
) => {
  if (!comments?.length) return "";
  return `<div class="post-comments">
    <div class="post-comments__title">最新评论</div>
    ${comments.map((comment) => buildCommentItem(comment, fallbackAvatar, faceSrc)).join("")}
  </div>`;
};

const buildActivityBadge = (post: NormalizedPost) => {
  const label = ACTIVITY_LABELS[post.activityType];
  if (!label) return "";
  const activityTime =
    post.activityAtTime != null
      ? formatWeiboDate(new Date(post.activityAtTime))
      : post.createdAtText || post.createdAt || "";
  return `<div class="activity-badge activity-badge--${post.activityType}">
    <span class="activity-badge__label">${escapeHtml(label)}</span>
    ${activityTime ? `<span class="activity-badge__time">${escapeHtml(activityTime)}</span>${post.activityType === "like" ? ' <span class="activity-badge__hint">(帖子发布时间)</span>' : ""}` : ""}
  </div>`;
};
const buildWeiboCardHtml = (
  profile: ProfileData,
  normalizedTimeline: ResolvedMediaPost[],
  faceSrc: FaceSrcMap = {},
) => {
  const user = profile?.user || {};
  const avatar =
    user.avatar_hd || user.avatar_large || user.profile_image_url || "";
  const cover = user.cover_image_phone || "";
  const posts = normalizedTimeline
    .map((post) => {
      const postUser = post.user || user;
      const postAvatar =
        postUser.avatar_large || postUser.profile_image_url || avatar;
      const retweetComment =
        post.activityType === "retweet" && isMeaningfulRetweetComment(post.text)
          ? `<div class="post-text post-text--comment">${formatPostText(post.text, faceSrc)}</div>`
          : "";
      const quotedPost =
        post.activityType === "retweet" && post.retweeted
          ? buildQuotedPost(post.retweeted, postAvatar, faceSrc)
          : "";
      const originalBody =
        post.activityType !== "retweet"
          ? `<div class="post-text">${formatPostText(post.text, faceSrc)}</div>
             ${buildPostMedia(post)}`
          : "";

      return `
        <article class="post post--${post.activityType}">
          ${buildActivityBadge(post)}
          <div class="post-header">
            <img class="post-avatar" src="${escapeHtml(postAvatar)}" alt="" />
            <div class="post-meta">
              <div class="post-name">${escapeHtml(postUser.screen_name || user.screen_name || "微博用户")}</div>
              <div class="post-time">${escapeHtml(post.createdAtText || post.createdAt || "")} ${escapeHtml(post.source || "")} ${escapeHtml(post.region_name || "")}</div>
            </div>
          </div>
          ${retweetComment}
          ${quotedPost}
          ${originalBody}
          <div class="post-stats">
            <span>转发 ${post.reposts_count ?? 0}</span>
            <span>评论 ${post.comments_count ?? 0}</span>
            <span>赞 ${post.attitudes_count ?? 0}</span>
          </div>
          ${buildPostComments(post.comments, postAvatar, faceSrc)}
        </article>
      `;
    })
    .join("");
  return `<div class="weibo-card">
  <div class="cover">
    ${cover ? `<img class="cover-image" src="${escapeHtml(cover)}" alt="" />` : ""}
  </div>
  <div class="profile">
      <img class="avatar" src="${escapeHtml(avatar)}" alt="" />
      <div class="profile-info">
        <div class="name">${escapeHtml(user.screen_name || "微博用户")}</div>
        <div class="desc">${escapeHtml(user.description || "暂无简介")}</div>
        <div class="location">${escapeHtml(user.location || "")}</div>
      </div>
    </div>
    <div class="stats">
      <span><strong>${escapeHtml(user.followers_count_str || "0")}</strong>粉丝</span>
      <span><strong>${user.friends_count ?? 0}</strong>关注</span>
      <span><strong>${user.statuses_count ?? normalizedTimeline.length}</strong>微博</span>
    </div>
    <div class="timeline">
      <div class="timeline-title">最近动态</div>
      ${posts || '<div class="post"><div class="post-text">暂无微博</div></div>'}
    </div>
  </div>`;
};

const TIMELINE_PAGE_STYLES = `
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif;
      background: #f3f4f6;
      padding: 24px;
      color: #1f2328;
    }
    .cover {
      height: 100px;
      overflow:hidden;
      display: flex;
      justify-content: center;
      align-items: center;
      width: 100%;
      line-height: 0;
      background: linear-gradient(135deg, #ff8a65 0%, #ff6a9b 45%, #7a5cff 100%);
    }
    .cover-image {
      object-fit: cover;
      object-position: center;
      display: block;
      width: 100%;
      max-width: 100%;
      height: auto;
    }
    .profile {
      display: flex;
      gap: 16px;
      padding: 0 24px 20px;
      margin-top: -36px;
      align-items: flex-end;
    }
    .avatar {
      width: 88px;
      height: 88px;
      border-radius: 50%;
      border: 4px solid #fff;
      object-fit: cover;
      background: #fff;
      flex-shrink: 0;
    }
    .profile-info { min-width: 0; padding-bottom: 4px; }
    .name {
      font-size: 24px;
      font-weight: 800;
      line-height: 1.2;
      margin-bottom: 6px;
    }
    .desc, .location {
      font-size: 13px;
      color: #57606a;
      line-height: 1.5;
    }
    .stats {
      display: flex;
      gap: 18px;
      padding: 0 24px 18px;
      font-size: 13px;
      color: #57606a;
    }
    .stats strong {
      color: #1f2328;
      margin-right: 4px;
    }
    .timeline {
      border-top: 1px solid #e6e8eb;
      padding: 8px 0 12px;
    }
    .timeline-title {
      padding: 14px 24px 8px;
      font-size: 15px;
      font-weight: 700;
    }
    .post {
      padding: 16px 24px;
      border-top: 1px solid #f0f2f5;
    }
    .activity-badge {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 10px;
      padding: 4px 10px;
      border-radius: 999px;
      font-size: 12px;
      font-weight: 600;
      line-height: 1.4;
    }
    .activity-badge__time {
      font-weight: 500;
      opacity: 0.85;
    }
    .activity-badge--original {
      background: #ecfdf5;
      color: #059669;
    }
    .activity-badge--retweet {
      background: #eff6ff;
      color: #2563eb;
    }
    .activity-badge--like {
      background: #fdf2f8;
      color: #db2777;
    }
    .post-header {
      display: flex;
      gap: 10px;
      align-items: center;
      margin-bottom: 10px;
    }
    .post-avatar {
      width: 40px;
      height: 40px;
      border-radius: 50%;
      object-fit: cover;
      flex-shrink: 0;
    }
    .post-name {
      font-size: 14px;
      font-weight: 700;
    }
    .post-time {
      font-size: 12px;
      color: #8b949e;
      margin-top: 2px;
    }
    .post-text {
      font-size: 15px;
      line-height: 1.7;
      white-space: pre-wrap;
      word-break: break-word;
      margin-bottom: 10px;
    }
    .weibo-face {
      width: 1.25em;
      height: 1.25em;
      vertical-align: -0.2em;
      display: inline;
      margin: 0 1px;
    }
    .post-text--comment {
      margin-bottom: 8px;
    }
    .quoted-post {
      margin-bottom: 10px;
      padding: 12px;
      border: 1px solid #e6e8eb;
      border-radius: 12px;
      background: #f8fafc;
    }
    .quoted-post-header {
      display: flex;
      gap: 8px;
      align-items: center;
      margin-bottom: 8px;
    }
    .quoted-post-avatar {
      width: 28px;
      height: 28px;
      border-radius: 50%;
      object-fit: cover;
      flex-shrink: 0;
    }
    .quoted-post-name {
      font-size: 13px;
      font-weight: 700;
      color: #57606a;
    }
    .quoted-post-time {
      font-size: 11px;
      color: #8b949e;
      margin-top: 2px;
    }
    .quoted-post-text {
      font-size: 14px;
      line-height: 1.6;
      color: #1f2328;
      white-space: pre-wrap;
      word-break: break-word;
    }
    .post-media-card {
      position: relative;
      margin-bottom: 10px;
      border-radius: 12px;
      overflow: hidden;
      background: #eef2f6;
    }
    .post-media-cover {
      display: block;
      max-width: 100%;
      width: auto;
      height: auto;
      background: #eef2f6;
    }
    .post-media-title {
      margin-bottom: 10px;
      font-size: 13px;
      color: #57606a;
      line-height: 1.5;
    }
    .post-media-card .post-media-title {
      position: absolute;
      left: 0;
      right: 0;
      bottom: 0;
      margin: 0;
      padding: 10px 12px;
      color: #fff;
      background: linear-gradient(transparent, rgba(0, 0, 0, 0.65));
    }
    .post-images {
      display: grid;
      gap: 6px;
      margin-top: 10px;
    }
    .post-images--single {
      grid-template-columns: 1fr;
    }
    .post-images--grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    .post-image {
      display: block;
      max-width: 100%;
      width: auto;
      height: auto;
      border-radius: 8px;
      background: #eef2f6;
    }
    .post-images-more {
      grid-column: 1 / -1;
      font-size: 12px;
      color: #8b949e;
      padding-top: 2px;
    }
    .post-stats {
      display: flex;
      gap: 16px;
      font-size: 12px;
      color: #8b949e;
    }
    .post-comments {
      margin-top: 12px;
      padding-top: 12px;
      border-top: 1px solid #f0f2f5;
    }
    .post-comments__title {
      font-size: 12px;
      font-weight: 700;
      color: #57606a;
      margin-bottom: 8px;
    }
    .comment-item {
      display: flex;
      gap: 8px;
      padding: 8px 0;
    }
    .comment-item + .comment-item {
      border-top: 1px solid #f6f8fa;
    }
    .comment-item--reply {
      padding-top: 6px;
    }
    .comment-replies {
      margin-top: 8px;
      padding-left: 10px;
      border-left: 2px solid #e6e8eb;
    }
    .comment-author {
      font-size: 10px;
      font-weight: 700;
      color: #db2777;
      background: #fdf2f8;
      border-radius: 999px;
      padding: 1px 6px;
    }
    .comment-avatar {
      width: 28px;
      height: 28px;
      border-radius: 50%;
      object-fit: cover;
      flex-shrink: 0;
    }
    .comment-body {
      min-width: 0;
      flex: 1;
    }
    .comment-meta {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      align-items: center;
      margin-bottom: 4px;
      font-size: 11px;
      color: #8b949e;
    }
    .comment-name {
      font-weight: 700;
      color: #57606a;
    }
    .comment-likes {
      margin-left: auto;
    }
    .comment-text {
      font-size: 13px;
      line-height: 1.6;
      color: #1f2328;
      white-space: pre-wrap;
      word-break: break-word;
    }
    #weibo-cards {
      display: flex;
      flex-direction: column;
      gap: 24px;
      width: ${CONSTANTS.RENDER_CARD_WIDTH}px;
    }
    .weibo-card,
    #weibo-card {
      width: ${CONSTANTS.RENDER_CARD_WIDTH}px;
      background: #fff;
      border-radius: 18px;
      overflow: hidden;
      box-shadow: 0 10px 30px rgba(31, 35, 40, 0.08);
    }
`;

const wrapTimelinePage = (bodyContent: string) => `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <style>${TIMELINE_PAGE_STYLES}</style>
</head>
<body>
  ${bodyContent}
</body>
</html>`;

export const buildTimelineHtml = (
  profile: ProfileData,
  normalizedTimeline: ResolvedMediaPost[],
  faceSrc: FaceSrcMap = {},
) => wrapTimelinePage(buildWeiboCardHtml(profile, normalizedTimeline, faceSrc));

export const buildMultiTimelineHtml = (
  entries: {
    profile: ProfileData;
    timeline: ResolvedMediaPost[];
    faceSrc?: FaceSrcMap;
  }[],
) =>
  wrapTimelinePage(
    `<div id="weibo-cards">${entries
      .map(({ profile, timeline, faceSrc }) =>
        buildWeiboCardHtml(profile, timeline, faceSrc),
      )
      .join("")}</div>`,
  );
