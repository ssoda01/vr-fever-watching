export interface NormalizedComment {
  id: string;
  /** 所属一级评论 ID；一级评论通常等于自身 id */
  rootId: string;
  text: string;
  createdAt: string;
  createdAtText: string;
  createdAtTime: number | null;
  user?: Record<string, any>;
  likesCount?: number;
  source?: string;
  /** 楼中楼总数（来自 total_number） */
  replyCount?: number;
  /** 是否为博主回复 */
  isAuthor?: boolean;
  /** 楼中楼（fetch_level=0 响应内嵌的 comments 字段） */
  replies?: NormalizedComment[];
}

export interface WeiboCommentsResult {
  comments: NormalizedComment[];
  total: number;
  maxId: string | null;
}
