import { CONSTANTS } from "../../util/constants";
import { formatWeiboDate, parseWeiboDateString } from "../../util/weibo-date";
import type { NormalizedComment } from "./types";

/** 优先 text_raw；否则从 HTML text 提取纯文本与表情 alt */
const extractCommentText = (comment: any): string => {
  if (comment?.text_raw) return comment.text_raw;
  const text = String(comment?.text || "");
  return text
    .replace(/<img[^>]*alt="([^"]*)"[^>]*>/gi, "$1")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .trim();
};

const normalizeComment = (
  comment: any,
  isReply = false,
): NormalizedComment | null => {
  if (!comment?.id) return null;

  const createdAt = comment?.created_at || "";
  const createdAtDate = parseWeiboDateString(createdAt);
  const replies =
    !isReply && Array.isArray(comment.comments) && comment.comments.length > 0
      ? comment.comments
          .slice(0, CONSTANTS.MAX_RENDER_COMMENT_REPLIES)
          .map((item: any) => normalizeComment(item, true))
          .filter((item): item is NormalizedComment => item != null)
      : undefined;

  return {
    id: String(comment.id),
    rootId: String(comment.rootidstr ?? comment.rootid ?? comment.id),
    text: extractCommentText(comment),
    createdAt,
    createdAtTime: createdAtDate?.getTime() ?? null,
    createdAtText: createdAtDate ? formatWeiboDate(createdAtDate) : createdAt,
    user: comment?.user,
    likesCount: comment?.like_counts ?? comment?.like_count ?? 0,
    source: comment?.source,
    replyCount: Number(comment?.total_number) || replies?.length || 0,
    isAuthor: Boolean(comment?.is_mblog_author),
    replies: replies?.length ? replies : undefined,
  };
};

export const normalizeComments = (payload: any): NormalizedComment[] => {
  const list = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.data)
      ? payload.data
      : [];

  return list
    .map((item) => normalizeComment(item))
    .filter((item): item is NormalizedComment => item != null);
};
