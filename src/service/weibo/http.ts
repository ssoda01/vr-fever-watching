import type { Context } from "koishi";
import { CONSTANTS } from "../../util/constants";
import {
  getXsrfTokenFromCookies,
  loadCookieStringFromDatabase,
  loadCookiesFromDatabase,
} from "../../util/cookies";

type WeiboHttpClient = {
  get: (url: string, config?: unknown) => Promise<any>;
};

const truncate = (value: unknown, max = 1500): string => {
  try {
    const text =
      typeof value === "string" ? value : JSON.stringify(value, null, 2);
    if (!text) return "";
    return text.length > max ? `${text.slice(0, max)}…` : text;
  } catch {
    return String(value);
  }
};

/** 把 HTTP / 微博接口异常格式化成一行，方便打到控制台 */
export const formatWeiboHttpError = (error: unknown): string => {
  if (!error || typeof error !== "object") return String(error);
  const err = error as {
    message?: string;
    code?: string;
    response?: {
      status?: number;
      statusText?: string;
      url?: string;
      data?: unknown;
    };
  };
  const parts: string[] = [err.message || String(error)];
  if (err.code) parts.push(`code=${err.code}`);
  if (err.response?.status != null) {
    parts.push(
      `status=${err.response.status}${err.response.statusText ? ` ${err.response.statusText}` : ""}`,
    );
  }
  if (err.response?.url) parts.push(`url=${err.response.url}`);
  if (err.response?.data != null) {
    parts.push(`body=${truncate(err.response.data)}`);
  }
  return parts.join(" | ");
};

const getWeiboApiError = (payload: unknown): string | null => {
  if (payload == null) return "响应为空";
  if (typeof payload === "string") {
    if (/<html/i.test(payload)) {
      return "返回了 HTML 页面（可能未登录或被重定向）";
    }
    return `非 JSON 响应: ${truncate(payload, 300)}`;
  }
  if (typeof payload !== "object") return `异常响应类型: ${typeof payload}`;

  const body = payload as Record<string, any>;
  if ("ok" in body && body.ok !== 1 && body.ok !== true) {
    const msg = body.msg ?? body.message ?? body.error ?? "";
    const errno = body.errno ?? body.error_code ?? body.error_type ?? "";
    return `ok=${body.ok}${msg ? ` msg=${msg}` : ""}${errno !== "" ? ` errno=${errno}` : ""}`;
  }
  return null;
};

/** 请求微博接口；HTTP 失败或业务错误（ok !== 1）都会打到控制台 */
export const requestWeiboApi = async (
  ctx: Context,
  http: WeiboHttpClient,
  path: string,
  label: string,
): Promise<any | null> => {
  try {
    const payload = await http.get(path);
    const apiError = getWeiboApiError(payload);
    if (apiError) {
      ctx.logger.error(`[weibo api] ${label} ${path} ${apiError}`);
      ctx.logger.error(`[weibo api] ${label} body=${truncate(payload)}`);
    }
    return payload;
  } catch (error) {
    ctx.logger.error(
      `[weibo api] ${label} ${path} ${formatWeiboHttpError(error)}`,
    );
    return null;
  }
};

/** 创建带登录态的微博网页 API 客户端 */
export const createWeiboHttp = async (ctx: Context, referer: string) => {
  const cookies = await loadCookiesFromDatabase(ctx);
  const xsrfToken = getXsrfTokenFromCookies(cookies);
  const cookieString = await loadCookieStringFromDatabase(ctx);

  if (!xsrfToken || !cookieString) {
    ctx.logger.error(
      `[weibo api] 无法创建请求：${!cookieString ? "缺少 Cookie" : "缺少 XSRF-TOKEN"}，请重新扫码登录`,
    );
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
