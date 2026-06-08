import type {
  NormalizedPost,
  NormalizedPostPageInfo,
  NormalizedRetweetedPost,
} from "../timeline/types";

export interface ProfileData {
  user?: {
    screen_name?: string;
    avatar_large?: string;
    avatar_hd?: string;
    profile_image_url?: string;
    verified?: boolean;
    description?: string;
    location?: string;
    followers_count_str?: string;
    friends_count?: number;
    statuses_count?: number;
    cover_image_phone?: string;
    id?: number | string;
    idstr?: string;
  };
}

export type ResolvedMediaPost = NormalizedPost & {
  resolvedImages?: string[];
  hiddenImageCount?: number;
  resolvedMediaCover?: string;
  retweeted?: NormalizedRetweetedPost & {
    resolvedImages?: string[];
    hiddenImageCount?: number;
    resolvedMediaCover?: string;
  };
};

export type ImageBudget = { remaining: number };

export type TimelineEntry = {
  profile: ProfileData;
  timeline: NormalizedPost[];
};

export type PostMediaSource = Pick<
  ResolvedMediaPost,
  | "pic_ids"
  | "pic_infos"
  | "page_info"
  | "resolvedImages"
  | "hiddenImageCount"
  | "resolvedMediaCover"
>;

export type { NormalizedPostPageInfo };
