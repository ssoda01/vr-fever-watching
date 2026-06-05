import { $, Channel, Context, h, Logger, Schema, Session } from "koishi";
import { CONSTANTS, REGEX } from "./util/constants";
import puppeteer from "koishi-plugin-puppeteer";
import {
  collectFullCookiesAfterLogin,
  ensurePuppeteerBrowser,
  formatPuppeteerError,
  getXsrfTokenFromCookies,
  loadCookiesFromDatabase,
  saveCookiesToDatabase,
  waitForLogin,
} from "./util/puppeteer-cookie";
import { sendImg, sendMsg } from "./util/send-msg";
import { getWeiboByUID } from "./service/catch";
import {
  filterTimelineWithinMinutes,
  mergeActivityTimeline,
} from "./util/timeline-normalizer";
import {
  drawTimeline,
  drawTimelines,
  type TimelineEntry,
} from "./service/drawer";
// import * as forward from "koishi-plugin-forward";

export const name = "weibo-monitor-multi";
const log = new Logger(name);

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
  // plantform: Schema.string()
  //   .default("onebot")
  //   .description("账号平台，只接受onebot平台"),
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

  const pollWeibo = async () => {
    log.info("定时器开始");
    const groups = await ctx.database
      .select("weibo_subscribes")
      .where({ isActive: true })
      .groupBy("groupID", {
        weiboUIDs: (row) => $.array(row.weiboUID),
      })
      .orderBy("groupID", "desc")
      .limit(10)
      .execute();

    const weiboUIDs = [...new Set(groups.flatMap((group) => group.weiboUIDs))];
    log.info("这一轮将发送的 weiboUIDs: %j", weiboUIDs);
    if (!weiboUIDs.length) {
      return;
    }
    // 每个 weiboUID 只拉取一次 JSON，结果缓存后再按群渲染
    const entryByUID = new Map<string, TimelineEntry | null>();
    await Promise.all(
      weiboUIDs.map(async (weiboUID) => {
        const result = await getWeiboByUID(weiboUID, ctx);
        if (!result?.profile || !result?.timeline) {
          entryByUID.set(weiboUID, null);
          return;
        }
        const normalizedTimeline = filterTimelineWithinMinutes(
          mergeActivityTimeline(result.timeline, result.like, weiboUID),
          CONSTANTS.TIME_SCOPE_MINUTES,
        );
        entryByUID.set(
          weiboUID,
          normalizedTimeline.length
            ? { profile: result.profile, timeline: normalizedTimeline }
            : null,
        );
      }),
    );

    for (const group of groups) {
      const session = sendMsgOnebot(group.groupID);
      const entries = [...new Set(group.weiboUIDs)]
        .map((weiboUID) => entryByUID.get(weiboUID))
        .filter((entry): entry is NonNullable<typeof entry> => entry !== null);

      if (!entries.length) {
        continue;
      }

      try {
        const image = await drawTimelines(ctx, entries);
        if (image) {
          await session.sendQueued(image);
        }
      } catch (error) {
        ctx.logger.warn(formatPuppeteerError(error));
      }
    }
  };

  ctx.setInterval(pollWeibo, config.waitMinutes * 60 * 1000);

  if (!ctx.puppeteer.browser?.connected) {
    await ctx.puppeteer.start();
  }

  ctx
    .command("test <message> <options>")
    .action(async (argv, message, options) => {
      // console.log("puppeteer", ctx.puppeteer);
      if (!ctx.puppeteer) {
        return "please install puppeteer plugin";
      }
      // argv.session.sendQueued("订阅成功");
      if (message === "订阅") {
        const weiboUID = options;
        const groupID = (argv.session?.channel as unknown as Channel)
          .id as string;
        if (!groupID) {
          return argv.session.sendQueued("未找到群ID");
        }
        await ctx.database.upsert("weibo_subscribes", (row) => {
          return [
            {
              id: `${row.weiboUID}-${row.groupID}`,
              weiboUID,
              groupID,
              isActive: true,
              createdAt: new Date(),
            },
          ];
        });
        const bot = ctx.bots[`onebot:${config.adminAccount}`];
        if (!bot) {
          return argv.session.sendQueued(
            `未找到机器人实例: onebot:${config.adminAccount}`,
          );
        }
        bot.sendMessage(groupID, `订阅成功: ${weiboUID}`);
        return argv.session.sendQueued("订阅成功");
      }
      if (message === "help") {
        sendMsg(
          "help: 帮助\rlogin: 登录\rcookie: 获取cookie\rcatch: 获取微博数据\rdraw: 绘制微博卡片",
          argv.session,
        );
      }
      if (message === "login") {
        try {
          await ensurePuppeteerBrowser(ctx);
          await getQRcode(ctx, argv.session);
        } catch (error) {
          sendMsg(formatPuppeteerError(error), argv.session);
        }
      }
      if (message === "cookie") {
        const cookies = await loadCookiesFromDatabase(ctx);
        if (!cookies || cookies.length === 0) {
          return argv.session.sendQueued("no cookies found");
        }
        return argv.session.sendQueued(JSON.stringify(cookies));
      }
      if (message == "catch") {
        try {
          const result = await getWeiboByUID(
            CONSTANTS.WEIBO_SAMPLE_UID,
            ctx,
            argv.session,
          );
          if (!result?.profile || !result?.timeline) {
            return argv.session.sendQueued("未找到微博数据");
          }
          const normalizedTimeline = filterTimelineWithinMinutes(
            mergeActivityTimeline(
              result.timeline,
              result.like,
              CONSTANTS.WEIBO_SAMPLE_UID,
            ),
            CONSTANTS.TIME_SCOPE_MINUTES,
          );
          return argv.session.sendQueued(
            JSON.stringify({ normalizedTimeline }),
          );
        } catch (error: any) {
          return argv.session.sendQueued(error.message);
        }
      }
      if (message === "draw") {
        try {
          await ensurePuppeteerBrowser(ctx);
          const result = await getWeiboByUID(
            CONSTANTS.WEIBO_SAMPLE_UID,
            ctx,
            argv.session,
          );
          if (!result?.profile || !result?.timeline) {
            return argv.session.sendQueued("未找到微博数据");
          }
          const normalizedTimeline = filterTimelineWithinMinutes(
            mergeActivityTimeline(
              result.timeline,
              result.like,
              CONSTANTS.WEIBO_SAMPLE_UID,
            ),
            CONSTANTS.TIME_SCOPE_MINUTES,
          );
          const image = await drawTimeline(
            ctx,
            result.profile,
            normalizedTimeline,
          );
          return argv.session.sendQueued(image);
        } catch (error: any) {
          return argv.session.sendQueued(formatPuppeteerError(error));
        }
      }
      return;
    });
}

const getQRcode = async (ctx: Context, session: Session): Promise<boolean> => {
  await ensurePuppeteerBrowser(ctx);
  const page = await ctx.puppeteer.page();
  if (!page) {
    sendMsg("无法创建浏览器页面", session);
    return false;
  }

  try {
    sendMsg("开启网站中...", session);
    await page.goto(CONSTANTS.WEIBO_PASSPORT_URL, {
      waitUntil: "domcontentloaded",
      timeout: CONSTANTS.WEB_TIMEOUT,
    });
    // console.log(page.content());
    // console.log(await page.cookies());
    let qrFound = false;
    const imgs = await page.$$("img");
    for (const el of imgs) {
      const picUrl = await el.evaluate((node) =>
        (node as HTMLImageElement).getAttribute("src"),
      );
      if (picUrl && new RegExp(REGEX.IS_QRPIC).test(picUrl)) {
        const res = await el.screenshot();
        sendImg(Buffer.from(res), session);
        qrFound = true;
        break;
      }
    }

    if (!qrFound) {
      sendMsg("未找到二维码", session);
      return false;
    }

    sendMsg("请使用微博 App 扫码登录...", session);
    const loggedIn = await waitForLogin(page);
    if (!loggedIn) {
      sendMsg("扫码超时，请重试", session);
      return false;
    }

    sendMsg("扫码成功，正在访问微博主页获取完整 Cookie...", session);

    const cookies = await collectFullCookiesAfterLogin(page);
    const xsrfToken = getXsrfTokenFromCookies(cookies);
    await saveCookiesToDatabase(ctx, cookies);

    if (xsrfToken) {
      sendMsg("存储成功！已包含 XSRF-TOKEN", session);
      return true;
    }

    sendMsg("存储成功，但未获取到 XSRF-TOKEN，接口可能不可用", session);
    return false;
  } catch (error) {
    sendMsg(formatPuppeteerError(error), session);
    return false;
  } finally {
    await page.close().catch(() => {});
    sendMsg("已关闭网站链接，结束扫码流程", session);
  }
};
