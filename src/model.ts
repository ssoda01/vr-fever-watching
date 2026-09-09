import type { Context } from "koishi";

export interface WeiboCookie {
  name: string;
  value: string;
  domain: string;
  updatedAt: Date;
}

export interface WeiboSubscribe {
  id: string;
  weiboUID: string;
  groupID: string;
  createdAt: Date;
  isActive: boolean;
  weiboName?: string;
  remark?: string;
}

/** 某群对某博主已推送的最近点赞游标 */
export interface WeiboLikeCursor {
  weiboUID: string;
  groupID: string;
  lastLikeId: string;
  /** 备忘：上次推进游标的时间，不参与查询 */
  lastLikeAt: Date;
}

declare module "koishi" {
  interface Tables {
    weibo_cookies: WeiboCookie;
    weibo_subscribes: WeiboSubscribe;
    weibo_like_cursors: WeiboLikeCursor;
  }
}

export function extendModels(ctx: Context) {
  ctx.model.extend(
    "weibo_cookies",
    {
      name: "string",
      value: "string",
      domain: "string",
      updatedAt: "timestamp",
    },
    {
      primary: ["name", "domain"],
    },
  );
  ctx.model.extend(
    "weibo_subscribes",
    {
      id: "string",
      weiboUID: "string",
      groupID: "string",
      createdAt: "timestamp",
      isActive: "boolean",
      weiboName: "string",
      remark: "string",
    },
    {
      primary: ["id"],
    },
  );
  ctx.model.extend(
    "weibo_like_cursors",
    {
      weiboUID: "string",
      groupID: "string",
      lastLikeId: "string",
      lastLikeAt: "timestamp",
    },
    {
      primary: ["weiboUID", "groupID"],
    },
  );
}
