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

declare module "koishi" {
  interface Tables {
    weibo_cookies: WeiboCookie;
    weibo_subscribes: WeiboSubscribe;
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
}
