import { formatWeiboDate } from "../../util/weibo-date";
import { getPageCoverUrl, getPostPicUrls } from "../../util/weibo-media";
import type { TimelineEntry } from "../drawer/types";
import type { NormalizedComment } from "../comment/types";
import type {
  ActivityType,
  NormalizedPost,
  NormalizedRetweetedPost,
} from "./types";

const MAX_CHUNK_LENGTH = 1500;

const ACTIVITY_LABELS: Record<ActivityType, string> = {
  original: "最近原创",
  retweet: "最近转发",
  like: "最近赞过",
};

const isMeaningfulRetweetComment = (text: string) =>
  Boolean(text?.trim()) && text.trim() !== "转发微博";

const formatCommentLines = (
  comment: NormalizedComment,
  prefix: string,
): string[] => {
  const name = comment.user?.screen_name ?? "匿名";
  const author = comment.isAuthor ? "[博主] " : "";
  const likes =
    comment.likesCount && comment.likesCount > 0
      ? ` (👍${comment.likesCount})`
      : "";
  const lines = [
    `${prefix}[${comment.createdAtText}] ${author}${name}: ${comment.text}${likes}`,
  ];
  comment.replies?.forEach((reply) => {
    lines.push(...formatCommentLines(reply, "  ↳ "));
  });
  return lines;
};

const formatMediaLines = (
  post: Pick<NormalizedPost, "pic_ids" | "pic_infos" | "page_info">,
): string[] => {
  const lines: string[] = [];
  const pics = getPostPicUrls(post.pic_ids, post.pic_infos, 9);
  if (pics.length) {
    lines.push(`[图片]`);
    lines.push(...pics);
  }
  if (post.page_info?.page_title) {
    const cover = getPageCoverUrl(post.page_info);
    lines.push(`[卡片] ${post.page_info.page_title}`);
    if (cover) lines.push(cover);
  }
  return lines;
};

const formatRetweeted = (retweeted: NormalizedRetweetedPost): string[] => {
  const name = retweeted.user?.screen_name || "微博用户";
  return [`↪ ${name}: ${retweeted.text}`, ...formatMediaLines(retweeted)];
};

const formatPost = (post: NormalizedPost, defaultName: string): string[] => {
  const lines: string[] = [];
  const label = ACTIVITY_LABELS[post.activityType];
  const activityTime =
    post.activityAtTime != null
      ? formatWeiboDate(new Date(post.activityAtTime))
      : post.createdAtText || post.createdAt || "";

  lines.push(`【${label}】${activityTime}`);
  if (post.activityType === "like") {
    lines.push("(帖子发布时间)");
  }

  const postUser = post.user?.screen_name || defaultName;
  const meta = [post.createdAtText || post.createdAt, post.source, post.region_name]
    .filter(Boolean)
    .join(" ");
  lines.push(`${postUser}${meta ? ` · ${meta}` : ""}`);

  if (post.activityType === "retweet") {
    if (isMeaningfulRetweetComment(post.text)) {
      lines.push(post.text);
    }
    if (post.retweeted) {
      lines.push(...formatRetweeted(post.retweeted));
    }
  } else {
    if (post.text) lines.push(post.text);
    lines.push(...formatMediaLines(post));
  }

  lines.push(
    `转发 ${post.reposts_count ?? 0} · 评论 ${post.comments_count ?? 0} · 赞 ${post.attitudes_count ?? 0}`,
  );
  if (post.url) lines.push(post.url);

  if (post.comments?.length) {
    lines.push("最新评论:");
    post.comments.forEach((comment, index) => {
      lines.push(...formatCommentLines(comment, `${index + 1}. `));
    });
  }

  lines.push("");
  return lines;
};

const chunkLines = (lines: string[]): string[] => {
  const chunks: string[] = [];
  let current = "";

  for (const line of lines) {
    const next = current ? `${current}\n${line}` : line;
    if (next.length > MAX_CHUNK_LENGTH && current) {
      chunks.push(current);
      current = line;
      continue;
    }
    current = next;
  }

  if (current) {
    chunks.push(current);
  }

  return chunks;
};

/** 将博主时间轴格式化为可发送的文本消息（按长度分段） */
export const formatEntryMessages = (entry: TimelineEntry): string[] => {
  const user = entry.profile.user || {};
  const name = user.screen_name || "微博用户";
  const lines = [
    `📢 ${name}`,
    "",
    ...entry.timeline.flatMap((post) => formatPost(post, name)),
  ];
  return chunkLines(lines);
};
