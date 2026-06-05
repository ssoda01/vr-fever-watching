import { Context, h, Schema, Session } from "koishi";
import { getWeiboAndSendMessageToGroup } from "./service/index";
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
import { drawTimeline } from "./service/drawer";
// import * as forward from "koishi-plugin-forward";

export const name = "weibo-monitor-multi";

export interface Config {}

export interface WeiboCookie {
  name: string;
  value: string;
  domain: string;
  updatedAt: Date;
}
declare module "koishi" {
  interface Tables {
    weibo_cookies: WeiboCookie;
  }
}
export const using = ["puppeteer", "database", "http"];

export const inject = {
  required: [...using],
  optional: ["console", "server"],
};
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

  if (!ctx.puppeteer.browser?.connected) {
    await ctx.puppeteer.start();
  }

  ctx.command("test <message>").action(async (argv, message) => {
    // console.log("puppeteer", ctx.puppeteer);
    if (!ctx.puppeteer) {
      return "please install puppeteer plugin";
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
        return argv.session.send("no cookies found");
      }
      return argv.session.send(JSON.stringify(cookies));
    }
    if (message == "catch") {
      try {
        const result = await getWeiboByUID(
          CONSTANTS.WEIBO_SAMPLE_UID,
          ctx,
          argv.session,
        );
        if (!result?.profile || !result?.timeline) {
          return argv.session.send("未找到微博数据");
        }
        const normalizedTimeline = filterTimelineWithinMinutes(
          mergeActivityTimeline(
            result.timeline,
            result.like,
            CONSTANTS.WEIBO_SAMPLE_UID,
          ),
          CONSTANTS.TIME_SCOPE_MINUTES,
        );
        return argv.session.send(JSON.stringify({ normalizedTimeline }));
      } catch (error: any) {
        return argv.session.send(error.message);
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
          return argv.session.send("未找到微博数据");
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
        return argv.session.send(image);
      } catch (error: any) {
        return argv.session.send(formatPuppeteerError(error));
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
