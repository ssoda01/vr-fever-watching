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
