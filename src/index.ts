import { Context, Schema, Session } from "koishi";
import { registerWeiboCommand } from "./commands/weibo";
import { createPollWeibo } from "./service/poll";
// import { ensurePuppeteerBrowser } from "./util/puppeteer-cookie";
import { getWaitMs } from "./util/timer";

export const name = "weibo-monitor-multi";

export interface WeiboCookie {
  name: string;
  value: string;
  domain: string;
  updatedAt: Date;
}

interface WeiboSubscribe {
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

export const using = ["puppeteer", "database", "http"];

export const inject = {
  required: [...using],
  optional: ["console", "server"],
};

export interface Config {
  adminAccount: string;
  waitMinutes: number;
}

export const Config: Schema<Config> = Schema.object({
  adminAccount: Schema.string().description("账号(qq号)"),
  waitMinutes: Schema.number()
    .default(3)
    .min(3)
    .description("隔多久拉取一次最新微博 (分钟)，最少3分钟"),
});

export async function apply(ctx: Context, config: Config) {
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

  const sendMsgOnebot = (groupId: string): Session => {
    const account = config.adminAccount.trim();
    const bot = ctx.bots[`onebot:${account}`];
    return {
      sendQueued: (content) => {
        if (!bot) {
          ctx.logger.warn(
            `未找到机器人实例: onebot:${account}，当前可用: ${Object.keys(ctx.bots).join(", ") || "无"}`,
          );
          return Promise.resolve([]);
        }
        return bot.sendMessage(groupId, content);
      },
    } as Session;
  };

  const pollWeibo = createPollWeibo(ctx, config, sendMsgOnebot);
  ctx.setInterval(pollWeibo, getWaitMs(config.waitMinutes));

  if (!ctx.puppeteer.browser?.connected) {
    await ctx.puppeteer.start();
  }

  registerWeiboCommand(ctx, config, pollWeibo);
}
