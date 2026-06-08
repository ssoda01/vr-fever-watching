import type { Context } from "koishi";
import { CONSTANTS } from "../util/constants";
import {
  getXsrfTokenFromCookies,
  loadCookieStringFromDatabase,
  loadCookiesFromDatabase,
} from "../util/puppeteer-cookie";

/** 创建带登录态的微博网页 API 客户端 */
export const createWeiboHttp = async (
  ctx: Context,
  referer: string,
) => {
  const cookies = await loadCookiesFromDatabase(ctx);
  const xsrfToken = getXsrfTokenFromCookies(cookies);
  const cookieString = await loadCookieStringFromDatabase(ctx);

  if (!xsrfToken || !cookieString) {
    return null;
  }

  return ctx.http.extend({
    endpoint: "https://weibo.com",
    headers: {
      accept: "application/json, text/plain, */*",
      "accept-language": "zh-CN,zh;q=0.9",
      "x-requested-with": "XMLHttpRequest",
      "x-xsrf-token": xsrfToken,
      cookie: cookieString,
      referer,
      "user-agent": CONSTANTS.USER_AGENT,
    },
  });
};
