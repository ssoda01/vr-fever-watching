import { Context, Schema, Session } from "koishi";
import { registerWeiboCommand } from "./commands/weibo";
import { createPollWeibo } from "./service/poll";
// import { ensurePuppeteerBrowser } from "./util/puppeteer-cookie";
import { getWaitMs } from "./util/timer";
import { checkLoginStatus } from "./service/login";

export const name = "vr-fever";

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
  adminGroupID: string;
  waitMinutes: number;
  isTextMode: boolean;
}

export const Config: Schema<Config> = Schema.object({
  adminAccount: Schema.string().description("账号(qq号)"),
  adminGroupID: Schema.string().description("管理员群ID，用于微博是否掉登录"),
  waitMinutes: Schema.number()
    .default(3)
    .min(3)
    .description("隔多久拉取一次最新微博 (分钟)，最少3分钟"),
  isTextMode: Schema.boolean()
    .default(false)
    .description("开启后以文本推送微博，关闭则以截图图片推送"),
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

  /**
   * 创建一个用于发送消息到OneBot的会话对象
   * @param groupId - 目标群组的ID
   * @returns 返回一个Session对象，包含发送消息的方法
   */
  const sendMsgOnebot = (groupId: string): Session => {
    // 获取管理员账号并去除首尾空格
    const account = config.adminAccount.trim();
    // 从上下文中获取指定账号的OneBot实例
    const bot = ctx.bots[`onebot:${account}`];
    // 返回一个Session对象
    return {
      // 发送消息方法，支持队列
      sendQueued: (content) => {
        // 检查机器人实例是否存在
        if (!bot) {
          // 如果不存在，记录警告日志并显示可用的机器人实例
          ctx.logger.warn(
            `未找到机器人实例: onebot:${account}，当前可用: ${Object.keys(ctx.bots).join(", ") || "无"}`,
          );
          return Promise.resolve([]);
        }
        return bot.sendMessage(groupId, content);
      },
    } as Session;
  };
  let checkingLoginStatus = false;
  const checkLoginStatusProcess = async (): Promise<void> => {
    if (checkingLoginStatus) {
      ctx.logger.debug("登录状态检查进行中，跳过本次定时任务");
      return;
    }
    checkingLoginStatus = true;
    try {
      // ctx.logger.info("开始检测登录状态...");
      if (!config.adminGroupID) {
        ctx.logger.error("管理员群ID未设置，无法发送消息");
        return;
      }
      const loginStatus = await checkLoginStatus(ctx);
      const formatter = (status: boolean) => {
        return `微博登录状态${status ? "正常" : "异常"}，当前时间戳: ${new Date().toLocaleString()}`;
      };
      if (!loginStatus) {
        await sendMsgOnebot(config.adminGroupID).sendQueued(formatter(false));
        ctx.logger.error(formatter(false));
        return;
      }
      // await sendMsgOnebot(config.adminGroupID).sendQueued(formatter(true));
      // ctx.logger.info(formatter(true));
    } finally {
      checkingLoginStatus = false;
    }
  };

  const pollWeibo = createPollWeibo(ctx, config, sendMsgOnebot);
  // 定时任务 - 抓微博
  ctx.setInterval(checkLoginStatusProcess, getWaitMs(30));
  // 定时任务 - 登录状态检测
  ctx.setInterval(pollWeibo, getWaitMs(config.waitMinutes));

  if (!ctx.puppeteer.browser?.connected) {
    await ctx.puppeteer.start();
  }

  registerWeiboCommand(ctx, config, pollWeibo);
}
