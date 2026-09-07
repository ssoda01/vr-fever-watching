import { Context, Session } from "koishi";
import {
  buildCookieString,
  getXsrfTokenFromCookies,
  loadCookiesFromDatabase,
  saveCookiesToDatabase,
  toPuppeteerCookies,
} from "../../util/cookies";
import { CONSTANTS } from "../../util/constants";
import { probeWeiboNetwork } from "../../util/network";
import {
  formatPuppeteerError,
  isPuppeteerConnectionError,
  navigatePage,
  withPuppeteerPage,
} from "../../util/puppeteer";
import { sendImg, sendMsg } from "../../util/send-msg";
import { getWaitMs, wait } from "../../util/timer";
import { captureLoginQrFromPage } from "./qr-capture";

const LOGIN_PAGE_TIMEOUT_MS = getWaitMs(0.4);

async function isLoggedIn(page: any): Promise<boolean> {
  try {
    const cookies = await page.cookies();
    return cookies.some((c: any) => c.name === "SUB");
  } catch {
    return false;
  }
}

async function waitForLogin(
  page: any,
  timeoutMs = 5 * 60 * 1000,
): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      if (await isLoggedIn(page)) return true;
    } catch (error) {
      if (isPuppeteerConnectionError(error)) throw error;
    }
    await wait(1000);
  }
  return false;
}

async function collectFullCookiesAfterLogin(page: any) {
  await navigatePage(page, CONSTANTS.WEIBO_HOME_URL);
  await wait(3000);
  return page.cookies();
}

/** 打开微博登录页，截图二维码并等待扫码完成 */
export const getQRcode = async (
  ctx: Context,
  session: Session,
  isDebugMode = false,
): Promise<boolean> => {
  try {
    sendMsg("正在检测微博网络...", session);
    const probe = await probeWeiboNetwork(ctx);
    if (!probe.ok) {
      sendMsg(probe.message, session);
      return false;
    }

    sendMsg(`网络正常（${probe.latencyMs}ms），开启网站中...`, session);
    return await withPuppeteerPage(
      ctx,
      async (page) => {
        await navigatePage(
          page,
          CONSTANTS.WEIBO_PASSPORT_URL,
          LOGIN_PAGE_TIMEOUT_MS,
          { maxAttempts: 1, waitUntil: ["domcontentloaded"] },
        );

        sendMsg("正在切换到扫码登录...", session);
        const qr = await captureLoginQrFromPage(
          page,
          LOGIN_PAGE_TIMEOUT_MS,
          isDebugMode,
        );
        if (qr.debugDir) {
          sendMsg(`调试截图已保存到: ${qr.debugDir}`, session);
        }
        if (!qr.detected || !qr.dataUrl) {
          sendMsg(
            isDebugMode
              ? "未找到二维码，请查看调试目录中的 page.png / meta.json"
              : "未找到二维码，请重试",
            session,
          );
          return false;
        }
        await sendImg(
          ctx,
          Buffer.from(
            qr.dataUrl.replace(/^data:image\/\w+;base64,/, ""),
            "base64",
          ),
          session,
        );
        sendMsg("请使用微博 App 扫码登录...", session);

        if (!(await waitForLogin(page))) {
          sendMsg("扫码超时，请重试", session);
          return false;
        }

        sendMsg("扫码成功，正在访问微博主页获取完整 Cookie...", session);
        const cookies = await collectFullCookiesAfterLogin(page);
        await saveCookiesToDatabase(ctx, cookies);

        if (getXsrfTokenFromCookies(cookies)) {
          sendMsg("存储成功！", session);
          return true;
        }
        sendMsg("存储成功，但未获取到 XSRF-TOKEN，接口可能不可用", session);
        return false;
      },
      { viewport: CONSTANTS.LOGIN_QR_VIEWPORT },
    );
  } catch (error) {
    sendMsg(formatPuppeteerError(error), session);
    return false;
  } finally {
    sendMsg("已关闭网站链接，结束扫码流程", session);
  }
};

async function renewCookies(ctx: Context, existingCookies: any[]) {
  return withPuppeteerPage(ctx, async (page) => {
    const puppeteerCookies = toPuppeteerCookies(existingCookies);
    if (puppeteerCookies.length) {
      await page.setCookie(...puppeteerCookies);
    }

    await navigatePage(page, CONSTANTS.WEIBO_HOME_URL);
    await wait(3000);

    if (!(await isLoggedIn(page))) {
      throw new Error("续期失败，可能 Token 已失效，需要重新扫码登录");
    }

    const cookies = await page.cookies();
    return {
      cookies,
      cookieString: buildCookieString(cookies),
    };
  });
}

export const checkLoginStatus = async (
  ctx: Context,
): Promise<boolean | null> => {
  try {
    const existingCookies = await loadCookiesFromDatabase(ctx);
    if (!existingCookies?.length) {
      return false;
    }

    const result = await renewCookies(ctx, existingCookies);
    if (getXsrfTokenFromCookies(result.cookies)) {
      await saveCookiesToDatabase(ctx, result.cookies);
      return true;
    }
    return false;
  } catch (error) {
    if (isPuppeteerConnectionError(error)) throw error;
    console.log("checkLoginStatus error:", formatPuppeteerError(error));
    return null;
  }
};

export const createLoginStatusWatch = (
  ctx: Context,
  adminGroupID: string,
  sendToGroup: (groupId: string) => Pick<Session, "sendQueued">,
) => {
  let running = false;
  return async () => {
    if (running) {
      ctx.logger.debug("登录状态检查进行中，跳过本次定时任务");
      return;
    }
    running = true;
    try {
      if (!adminGroupID) {
        ctx.logger.error("管理员群ID未设置，无法发送消息");
        return;
      }
      const loginStatus = await checkLoginStatus(ctx);
      if (!loginStatus) {
        const message = `微博登录状态异常，当前时间戳: ${new Date().toLocaleString()}`;
        await sendToGroup(adminGroupID).sendQueued(message);
        ctx.logger.error(message);
      }
    } finally {
      running = false;
    }
  };
};
