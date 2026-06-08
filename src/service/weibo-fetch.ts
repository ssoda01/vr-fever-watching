import { Context, Session } from "koishi";
import { writeFile } from "node:fs/promises";
import { CONSTANTS } from "../util/constants";
import {
  getXsrfTokenFromCookies,
  loadCookieStringFromDatabase,
  loadCookiesFromDatabase,
} from "../util/puppeteer-cookie";

/** 拉取指定 UID 的微博主页、时间线与点赞列表 */
export const getWeiboByUID = async (
  weiboUID: string,
  ctx: Context,
  _session?: Session,
) => {
  const cookies = await loadCookiesFromDatabase(ctx);
  const xsrfToken = getXsrfTokenFromCookies(cookies);
  const cookieString = await loadCookieStringFromDatabase(ctx);

  if (!xsrfToken || !cookieString) {
    return null;
  }

  const weiboHttp = ctx.http.extend({
    endpoint: "https://weibo.com",
    headers: {
      accept: "application/json, text/plain, */*",
      "accept-language": "zh-CN,zh;q=0.9",
      "x-requested-with": "XMLHttpRequest",
      "x-xsrf-token": xsrfToken,
      cookie: cookieString,
      referer: `https://weibo.com/u/${weiboUID}`,
      "user-agent": CONSTANTS.USER_AGENT,
    },
  });

  const profile = await weiboHttp
    .get(`/ajax/profile/info?uid=${weiboUID}&scene=profile`)
    .then((res: any) => res?.data || null);

  const timeline = await weiboHttp
    .get(`/ajax/statuses/mymblog?uid=${weiboUID}&page=1&feature=0`)
    .then((res: any) => res?.data || null);

  const like = await weiboHttp
    .get(`/ajax/statuses/likelist?uid=${weiboUID}&page=1&with_total=true`)
    .then((res: any) => res?.data || null);

  await Promise.all([
    writeFile("profile.json", JSON.stringify(profile, null, 2), "utf-8"),
    writeFile("timeline.json", JSON.stringify(timeline, null, 2), "utf-8"),
    writeFile("like.json", JSON.stringify(like, null, 2), "utf-8"),
  ]);

  return { profile, timeline, like };
};
