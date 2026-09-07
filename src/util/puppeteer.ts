import { CONSTANTS } from "./constants";
import { formatNetworkError, isNetworkError } from "./network";
import { wait } from "./timer";

type WaitUntil = "load" | "domcontentloaded" | "networkidle0" | "networkidle2";

export interface NavigatePageOptions {
  maxAttempts?: number;
  waitUntil?: readonly WaitUntil[];
}

export function isPuppeteerConnectionError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return (
    message.includes("Connection closed") ||
    message.includes("Protocol error") ||
    message.includes("Session closed") ||
    message.includes("Target closed")
  );
}

export function formatPuppeteerError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (isPuppeteerConnectionError(error)) {
    return "浏览器连接已断开。开发模式下保存代码会触发热重载，请等 Koishi 重载完成后再执行 test login。";
  }
  if (isNetworkError(error)) {
    return formatNetworkError(error, CONSTANTS.WEB_TIMEOUT);
  }
  if (
    message.includes("Navigation timeout") ||
    message.includes("TimeoutError")
  ) {
    return "访问微博页面超时，请检查网络连接或稍后重试。";
  }
  return message;
}

export async function ensurePuppeteerBrowser(ctx: any) {
  if (!ctx.puppeteer?.page) {
    throw new Error("未检测到 koishi-plugin-puppeteer");
  }
  const browser = ctx.puppeteer.browser;
  if (!browser || !browser.connected) {
    if (browser && typeof ctx.puppeteer.stop === "function") {
      await ctx.puppeteer.stop().catch(() => {});
    }
    await ctx.puppeteer.start();
  }
}

async function preparePage(page: any) {
  await page.setUserAgent(CONSTANTS.USER_AGENT).catch(() => {});
  await page
    .setExtraHTTPHeaders({
      referer: CONSTANTS.WEIBO_HOME_URL,
      "accept-language": "zh-CN,zh;q=0.9",
    })
    .catch(() => {});
}

export async function navigatePage(
  page: any,
  url: string,
  timeoutMs = CONSTANTS.WEB_TIMEOUT,
  options: NavigatePageOptions = {},
) {
  await preparePage(page);

  const maxAttempts = options.maxAttempts ?? 3;
  const waitUntilOptions = options.waitUntil ?? ["domcontentloaded", "load"];
  let lastError: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    for (const waitUntil of waitUntilOptions) {
      try {
        await page.goto(url, { waitUntil, timeout: timeoutMs });
        return;
      } catch (error) {
        lastError = error;
        const message = error instanceof Error ? error.message : String(error);
        if (isNetworkError(error) && !message.includes("TimeoutError")) {
          throw error;
        }
        if (
          !message.includes("Navigation timeout") &&
          !message.includes("TimeoutError")
        ) {
          throw error;
        }
      }
    }
    if (attempt < maxAttempts - 1) await wait(2000);
  }
  throw lastError;
}

/** 创建 Puppeteer 页面，用完后关闭 */
export async function withPuppeteerPage<T>(
  ctx: any,
  run: (page: any) => Promise<T>,
  options?: { viewport?: Record<string, unknown> },
): Promise<T> {
  await ensurePuppeteerBrowser(ctx);
  const page = await ctx.puppeteer.page();
  if (!page) {
    throw new Error("无法创建浏览器页面");
  }
  if (options?.viewport) {
    await page.setViewport(options.viewport);
  }
  try {
    return await run(page);
  } finally {
    await page.close().catch(() => {});
  }
}

/** koishi-plugin-puppeteer 的 render 返回 h.image().toString()，不是原始 PNG */
export function parsePuppeteerRenderOutput(output: string | Buffer): Buffer {
  if (Buffer.isBuffer(output)) return output;
  const match = output.match(/data:image\/[^;]+;base64,([^"]+)/);
  if (!match) {
    throw new Error("无法从 puppeteer 渲染结果解析图片数据");
  }
  return Buffer.from(match[1], "base64");
}
