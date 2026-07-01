import { Context, Session } from "koishi";
import { CONSTANTS } from "../util/constants";
import {
  captureLoginQrFromPage,
  collectFullCookiesAfterLogin,
  ensurePuppeteerBrowser,
  formatPuppeteerError,
  getXsrfTokenFromCookies,
  isPuppeteerConnectionError,
  loadCookiesFromDatabase,
  navigatePage,
  renewCookiesViaService,
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
    await navigatePage(page, CONSTANTS.WEIBO_PASSPORT_URL);

    sendMsg("正在切换到扫码登录...", session);
    const qrResult = await captureLoginQrFromPage(page, 15000);
    if (qrResult.debugDir) {
      sendMsg(`调试截图已保存到: ${qrResult.debugDir}`, session);
    }
    if (!qrResult.detected || !qrResult.dataUrl) {
      sendMsg("未找到二维码，请查看调试目录中的 page.png / meta.json", session);
      return false;
    }

    const base64 = qrResult.dataUrl.replace(/^data:image\/\w+;base64,/, "");
    sendImg(Buffer.from(base64, "base64"), session);

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
      sendMsg("存储成功！", session);
      // sendMsg("存储成功！已包含 XSRF-TOKEN", session);
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
export const checkLoginStatus = async (
  ctx: Context,
): Promise<boolean | null> => {
  try {
    const existingCookies = await loadCookiesFromDatabase(ctx);
    if (!existingCookies?.length) {
      return false;
    }

    await ensurePuppeteerBrowser(ctx);
    const result = await renewCookiesViaService(ctx, existingCookies);
    const xsrfToken = getXsrfTokenFromCookies(result.cookies);
    if (xsrfToken) {
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
