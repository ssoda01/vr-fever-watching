import type { WeiboCommentsResult } from "./types";

const MAX_CHUNK_LENGTH = 1500;

const formatCommentLines = (
  comment: WeiboCommentsResult["comments"][number],
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

/** 将评论格式化为可读文本，并按 QQ 消息长度分段 */
export const formatCommentsMessages = (
  result: WeiboCommentsResult,
): string[] => {
  const header = `共 ${result.total} 条评论，本次 ${result.comments.length} 条：`;
  const lines = [
    header,
    ...result.comments.flatMap((comment, index) =>
      formatCommentLines(comment, `${index + 1}. `),
    ),
  ];

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
