import { Context, Session } from "koishi";
import { CONSTANTS, REGEX } from "../util/constants";
import {
  collectFullCookiesAfterLogin,
  ensurePuppeteerBrowser,
  formatPuppeteerError,
  getXsrfTokenFromCookies,
  saveCookiesToDatabase,
  waitForLogin,
} from "../util/puppeteer-cookie";
import { sendImg, sendMsg } from "../util/send-msg";

/** 打开微博登录页，截图二维码并等待扫码完成 */
export const getQRcode = async (
  ctx: Context,
  session: Session,
): Promise<boolean> => {
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
