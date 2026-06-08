import type { NormalizedComment } from "./types";

const isWithinWindow = (time: number | null, cutoff: number) =>
  time != null && time >= cutoff;

const filterReplyTree = (
  comment: NormalizedComment,
  cutoff: number,
): NormalizedComment | null => {
  const replies = (comment.replies ?? [])
    .map((reply) => filterReplyTree(reply, cutoff))
    .filter((reply): reply is NormalizedComment => reply != null);

  const inWindow = isWithinWindow(comment.createdAtTime, cutoff);
  if (!inWindow && !replies.length) return null;

  return {
    ...comment,
    replies: replies.length ? replies : undefined,
  };
};

/** 保留指定分钟数内的评论（含楼中楼） */
export const filterCommentsWithinMinutes = (
  comments: NormalizedComment[],
  minutes: number,
): NormalizedComment[] => {
  const windowMs = minutes > 0 ? minutes * 60 * 1000 : 60000;
  const cutoff = Date.now() - windowMs;

  return comments
    .map((comment) => filterReplyTree(comment, cutoff))
    .filter((comment): comment is NormalizedComment => comment != null);
};
