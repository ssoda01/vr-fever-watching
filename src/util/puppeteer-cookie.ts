import fs from "node:fs/promises";
import path from "node:path";
import { CONSTANTS } from "./constants";
type AnyCookie = any;

const WEIBO_PASSPORT_URL = "https://passport.weibo.com/";

export interface CookieResult {
  cookieString: string;
  cookies: AnyCookie[];
  qrImageDataUrl?: string;
  qrDetected?: boolean;
}

export async function saveCookiesToDatabase(ctx: any, cookies: AnyCookie[]) {
  const now = new Date();
  const simplifiedCookies = cookies.map((c) => ({
    name: c.name,
    value: c.value,
    domain: c.domain,
    updatedAt: now,
  }));

  // Koishi 的 ctx.database.upsert 默认行为就是：存在主键则更新，不存在则插入
  // 因为在 index.ts 中我们将 ['name', 'domain'] 设置为了复合主键
  await ctx.database.upsert("weibo_cookies", simplifiedCookies);
}

export async function loadCookiesFromDatabase(
  ctx: any,
): Promise<AnyCookie[] | null> {
  try {
    const cookies = await ctx.database.get("weibo_cookies", {});
    return cookies.length > 0 ? cookies : null;
  } catch {
    return null;
  }
}

export async function loadCookieStringFromDatabase(
  ctx: any,
): Promise<string | null> {
  try {
    const cookies = await loadCookiesFromDatabase(ctx);
    if (!cookies) return null;
    return buildCookieString(cookies);
  } catch {
    return null;
  }
}

export function buildCookieString(cookies: AnyCookie[]): string {
  const filtered = cookies.filter(
    (c) => c.domain.includes("weibo.com") || c.domain.includes("weibo.cn"),
  );
  return filtered.map((c) => `${c.name}=${c.value}`).join("; ");
}

export function getXsrfTokenFromCookies(
  cookies: AnyCookie[] | null | undefined,
): string | null {
  return cookies?.find((cookie) => cookie.name === "XSRF-TOKEN")?.value || null;
}

/** 为 Puppeteer 页面注入微博 Cookie 和 Referer，便于浏览器直接加载 CDN 图片 */
export async function setupWeiboRenderPage(
  page: any,
  cookies: AnyCookie[] | null | undefined,
) {
  await page.setUserAgent(CONSTANTS.USER_AGENT).catch(() => {});
  await page
    .setExtraHTTPHeaders({
      referer: "https://weibo.com/",
      "accept-language": "zh-CN,zh;q=0.9",
    })
    .catch(() => {});

  if (cookies?.length) {
    const puppeteerCookies = cookies
      .filter((cookie) => cookie.name && cookie.value && cookie.domain)
      .map((cookie) => ({
        name: cookie.name,
        value: cookie.value,
        domain: cookie.domain,
        path: "/",
      }));
    if (puppeteerCookies.length) {
      await page.setCookie(...puppeteerCookies).catch(() => {});
    }
  }

  await page
    .goto("https://weibo.com/", {
      waitUntil: "domcontentloaded",
      timeout: CONSTANTS.WEB_TIMEOUT,
    })
    .catch(() => {});
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
  if (
    message.includes("ERR_CONNECTION_CLOSED") ||
    message.includes("ERR_CONNECTION_RESET") ||
    message.includes("ERR_NETWORK")
  ) {
    return "无法连接微博网站，请检查网络或代理设置后重试。";
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
}

async function gotoAndWait(page: any, url: string, timeoutMs: number) {
  await preparePage(page);
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: timeoutMs });
}

async function wait(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function isLoggedIn(page: any): Promise<boolean> {
  try {
    const cookies = await page.cookies();
    // 微博登录成功的核心标志是存在 SUB (Session User Badge) cookie
    const hasSub = cookies.some((c: any) => c.name === "SUB");
    return hasSub;
  } catch {
    return false;
  }
}

export async function waitForLogin(
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

/** 登录成功后访问微博主页，拿到包含 XSRF-TOKEN 的完整 Cookie */
export async function collectFullCookiesAfterLogin(
  page: any,
): Promise<AnyCookie[]> {
  await gotoAndWait(page, "https://weibo.com/", 60000);
  await wait(3000);
  return page.cookies();
}

export interface QrLoginOptions {
  timeoutMs?: number;
  onPageCreated?: (page: any) => void | Promise<void>;
  onQrCaptured?: (dataUrl: string | null) => void | Promise<void>;
}

async function clickQrTabIfNeeded(page: any) {
  const clicked = await page.evaluate(() => {
    const keywords = ["扫码", "二维码", "Scan", "QR"];
    const candidates = Array.from(
      document.querySelectorAll("button, a, div, span, li"),
    );
    for (const el of candidates) {
      const text = (el as HTMLElement).innerText || "";
      const className = (el as HTMLElement).className || "";
      if (
        keywords.some((k) => text.includes(k)) ||
        className.includes("qr") ||
        className.includes("Qr")
      ) {
        (el as HTMLElement).click();
        return true;
      }
    }
    return false;
  });
  if (!clicked) {
    // try common selectors
    const sel = [
      ".qrcode",
      ".qr",
      '[class*="qr"]',
      '[class*="qrcode"]',
      'li[class*="qr"]',
      'div[role="tab"]',
      'a[href*="qr"]',
    ];
    for (const s of sel) {
      const el = await page.$(s);
      if (el) {
        try {
          await el.click();
          break;
        } catch {}
      }
    }
  }
}

async function getQrElement(page: any) {
  const selectors = [
    // Common QR code selectors
    'img[src*="qr"]',
    'img[src*="qrcode"]',
    'img[alt*="二维码"]',
    'img[alt*="QR"]',
    'img[alt*="Scan"]',

    // Class-based selectors
    ".qrcode img",
    ".qr img",
    '[class*="qr"] img',
    '[class*="qrcode"] img',
    '[class*="QR"] img',
    '[class*="Qr"] img',

    // Canvas-based QR codes
    '[class*="qr"] canvas',
    '[class*="qrcode"] canvas',
    "canvas",

    // Container-based selectors
    ".qrcode",
    ".qr",
    '[class*="qr"]',
    '[class*="qrcode"]',

    // Weibo-specific selectors
    '[id*="qr"]',
    '[data-role="qrcode"]',
    '[data-type="qrcode"]',
    'div[class*="qrcode"]',
    'section[class*="qrcode"]',
  ];

  for (const sel of selectors) {
    const el = await page.$(sel);
    if (el) {
      // Check if this element is actually a QR code by looking at its size and content
      const boundingBox = await el.boundingBox();
      if (boundingBox && boundingBox.width > 100 && boundingBox.height > 100) {
        return el;
      }
    }
  }

  // Try to find QR code by context
  const found = await page.evaluate(() => {
    const texts = [
      "扫描二维码登录",
      "打开微博手机APP",
      "扫一扫",
      "Scan QR Code",
      "QR Code",
    ];
    const elements = Array.from(
      document.querySelectorAll("div, section, article, form, main"),
    );
    for (const el of elements) {
      const text = (el as HTMLElement).innerText || "";
      if (!texts.some((item) => text.includes(item))) continue;

      // Look for images or canvases in this context
      const target = el.querySelector(
        'canvas, img, [class*="qr"], [class*="qrcode"]',
      );
      if (target) {
        target.setAttribute("data-koishi-weibo-qr", "true");
        return true;
      }
    }
    return false;
  });

  if (found) {
    const element = await page.$('[data-koishi-weibo-qr="true"]');
    if (element) return element;
  }

  // As a last resort, try to find any image or canvas that looks like a QR code
  const allImages = await page.$$("img, canvas");
  for (const img of allImages) {
    const boundingBox = await img.boundingBox();
    if (boundingBox && boundingBox.width > 100 && boundingBox.height > 100) {
      // Check if it's roughly square
      const aspectRatio = boundingBox.width / boundingBox.height;
      if (aspectRatio > 0.8 && aspectRatio < 1.2) {
        return img;
      }
    }
  }

  return null;
}

async function waitForQrElement(page: any, timeoutMs: number) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const element = await getQrElement(page);
    if (element) return element;
    await wait(500);
  }
  return null;
}

export async function captureQrFromPage(
  page: any,
  timeoutMs = 1500,
): Promise<{ dataUrl: string | null; detected: boolean }> {
  try {
    const element = await waitForQrElement(page, timeoutMs);
    if (!element) {
      return { dataUrl: null, detected: false };
    }
    const base64 = await element.screenshot({ encoding: "base64" });
    return {
      dataUrl: `data:image/png;base64,${String(base64)}`,
      detected: true,
    };
  } catch {
    return { dataUrl: null, detected: false };
  }
}

export async function loginWithQrViaService(
  ctx: any,
  opts: QrLoginOptions = {},
): Promise<CookieResult> {
  if (!ctx.puppeteer?.page) {
    throw new Error("未检测到可用的 Puppeteer 服务");
  }
  if (!ctx.puppeteer.browser && typeof ctx.puppeteer.start === "function") {
    await ctx.puppeteer.start();
  }
  const page = await ctx.puppeteer.page();
  try {
    await opts.onPageCreated?.(page);
    await gotoAndWait(page, WEIBO_PASSPORT_URL, opts.timeoutMs || 120000);

    // Try to find and click QR tab multiple times
    for (let i = 0; i < 3; i++) {
      await clickQrTabIfNeeded(page);
      await wait(1000);
      const qrResult = await captureQrFromPage(page, 5000);
      if (qrResult.detected) break;
    }

    // Wait a bit more for the page to load
    await wait(2000);

    const qrResult = await captureQrFromPage(page, 15000);
    if (!qrResult.detected) {
      // Take a screenshot for debugging
      const screenshot = await page.screenshot({ encoding: "base64" });
      const screenshotDataUrl = `data:image/png;base64,${String(screenshot)}`;
      console.error(
        "QR code detection failed. Page screenshot:",
        screenshotDataUrl.substring(0, 100) + "...",
      );

      // Try to get page content for debugging
      const pageContent = await page.content();
      console.error(
        "Page content preview:",
        pageContent.substring(0, 500) + "...",
      );

      throw new Error(
        "未识别到微博二维码，请确认当前页面已进入扫码登录态。可能是微博登录页面结构已更新。",
      );
    }

    await opts.onQrCaptured?.(qrResult.dataUrl);
    const start = Date.now();
    const limit = opts.timeoutMs || 120000;
    while (Date.now() - start < limit) {
      if (await isLoggedIn(page)) break;
      await wait(2000);
    }
    if (!(await isLoggedIn(page))) {
      throw new Error("扫码登录超时");
    }
    const cookies = await page.cookies();
    const cookieString = buildCookieString(cookies);
    return {
      cookieString,
      cookies,
      qrImageDataUrl: qrResult.dataUrl || undefined,
      qrDetected: qrResult.detected,
    };
  } finally {
    await page.close().catch(() => {});
  }
}

/**
 * 静默打开微博主页，利用已有的 Cookie 自动续期
 */
export async function renewCookiesViaService(
  ctx: any,
  existingCookies: AnyCookie[],
): Promise<CookieResult> {
  if (!ctx.puppeteer?.page) {
    throw new Error("未检测到可用的 Puppeteer 服务");
  }
  if (!ctx.puppeteer.browser && typeof ctx.puppeteer.start === "function") {
    await ctx.puppeteer.start();
  }

  const page = await ctx.puppeteer.page();
  try {
    // 注入现有的 Cookie
    if (existingCookies && existingCookies.length > 0) {
      // 过滤掉可能导致冲突的无效 cookie
      const validCookies = existingCookies.filter(
        (c) => c.name && c.value && c.domain,
      );
      await page.setCookie(...validCookies);
    }

    // 访问微博首页，这通常会触发微博的鉴权和 Cookie 续期
    await gotoAndWait(page, "https://weibo.com/", 60000);

    // 等待页面加载和可能的重定向完成
    await wait(3000);

    // 验证续期后是否仍然处于登录状态
    if (!(await isLoggedIn(page))) {
      throw new Error("续期失败，可能 Token 已失效，需要重新扫码登录");
    }

    // 提取续期后的最新 Cookie
    const cookies = await page.cookies();
    const cookieString = buildCookieString(cookies);

    return {
      cookieString,
      cookies,
    };
  } finally {
    await page.close().catch(() => {});
  }
}
