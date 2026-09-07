import type { Context } from "koishi";
import { CONSTANTS } from "./constants";

export type NetworkProbeResult =
  | { ok: true; latencyMs: number }
  | { ok: false; message: string };

const NETWORK_ERROR_HINTS = [
  "ENOTFOUND",
  "EAI_AGAIN",
  "ECONNREFUSED",
  "ECONNRESET",
  "ECONNABORTED",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "ETIMEDOUT",
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_HEADERS_TIMEOUT",
  "UND_ERR_BODY_TIMEOUT",
  "ERR_INTERNET_DISCONNECTED",
  "ERR_NAME_NOT_RESOLVED",
  "ERR_CONNECTION_REFUSED",
  "ERR_CONNECTION_TIMED_OUT",
  "ERR_CONNECTION_CLOSED",
  "ERR_CONNECTION_RESET",
  "ERR_ADDRESS_UNREACHABLE",
  "ERR_PROXY_CONNECTION_FAILED",
  "ERR_TUNNEL_CONNECTION_FAILED",
  "ERR_NETWORK_CHANGED",
  "ERR_TIMED_OUT",
  "ERR_NETWORK",
];

export function isNetworkError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  const code =
    error && typeof error === "object" && "code" in error
      ? String((error as { code?: unknown }).code || "")
      : "";
  return NETWORK_ERROR_HINTS.some(
    (hint) => message.includes(hint) || code.includes(hint),
  );
}

export function formatNetworkError(
  error: unknown,
  timeoutMs = CONSTANTS.NETWORK_PROBE_TIMEOUT_MS,
): string {
  const message = error instanceof Error ? error.message : String(error);
  const code =
    error && typeof error === "object" && "code" in error
      ? String((error as { code?: unknown }).code || "")
      : "";
  const text = `${code} ${message}`;

  if (
    code === "ETIMEDOUT" ||
    /timeout|TIMED_OUT|ETIMEDOUT/i.test(text)
  ) {
    return `连接微博超时（${Math.round(timeoutMs / 1000)}s），请检查网络或代理后重试`;
  }
  if (/ENOTFOUND|EAI_AGAIN|ERR_NAME_NOT_RESOLVED|getaddrinfo/i.test(text)) {
    return "无法解析微博域名，请检查 DNS 或网络后重试";
  }
  if (/ERR_PROXY|ERR_TUNNEL|proxy/i.test(text)) {
    return "代理无法连接微博，请检查代理设置后重试";
  }
  if (/certificate|CERT|SSL|TLS/i.test(text)) {
    return "微博 HTTPS 证书校验失败，请检查系统时间或代理设置";
  }
  return "无法连接微博网站，请检查网络或代理设置后重试";
}

/** 用 Koishi HTTP 短超时探测微博登录页是否可达，避免 Puppeteer 长时间空等 */
export async function probeWeiboNetwork(
  ctx: Context,
  url = CONSTANTS.WEIBO_PASSPORT_URL,
  timeoutMs = CONSTANTS.NETWORK_PROBE_TIMEOUT_MS,
): Promise<NetworkProbeResult> {
  const started = Date.now();
  try {
    await ctx.http.get(url, {
      timeout: timeoutMs,
      redirect: "follow",
      responseType: "text",
      validateStatus: () => true,
      headers: {
        "user-agent": CONSTANTS.USER_AGENT,
        "accept-language": "zh-CN,zh;q=0.9",
      },
    });
    return { ok: true, latencyMs: Date.now() - started };
  } catch (error) {
    return { ok: false, message: formatNetworkError(error, timeoutMs) };
  }
}
