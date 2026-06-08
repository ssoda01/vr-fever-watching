import fs from "node:fs/promises";
import path from "node:path";
import { CONSTANTS } from "./constants";
type AnyCookie = any;

const WEIBO_PASSPORT_URL = "https://passport.weibo.com/";
const LOGIN_QR_DEBUG_DIR = path.join(process.cwd(), "data", "weibo-login-debug");

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

/** 微博登录页默认可能是短信登录，需先点击 scan.png 图标所在父 span 切换到「扫码登录」 */
export async function clickWeiboQrLoginTab(page: any): Promise<boolean> {
  return page.evaluate(() => {
    const imgs = Array.from(document.querySelectorAll("img"));
    const scanIcon = imgs.find((img) =>
      (img.getAttribute("src") || "").includes("scan.png"),
    );
    const parentSpan = scanIcon?.parentElement;
    if (parentSpan?.tagName !== "SPAN") return false;
    parentSpan.click();
    return true;
  });
}

async function clickQrTabIfNeeded(page: any) {
  await clickWeiboQrLoginTab(page);
}

async function getQrElement(page: any) {
  const selectors = [
    // Common QR code selectors
    'img[src*="qr"]:not([src*="scan.png"])',
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
        'canvas, img:not([src*="scan.png"]), [class*="qrcode"]',
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

async function waitForQrElementReady(page: any) {
  await page.evaluate(async () => {
    const isReady = (node: Element) => {
      if (node instanceof HTMLImageElement) {
        return node.complete && node.naturalWidth > 0;
      }
      if (node instanceof HTMLCanvasElement) {
        return node.width > 0 && node.height > 0;
      }
      const img = node.querySelector("img, canvas");
      return img ? isReady(img) : true;
    };

    const target =
      document.querySelector('[data-koishi-weibo-qr="true"]') ||
      Array.from(document.querySelectorAll("img")).find(
        (img) =>
          (img.getAttribute("src") || "").includes("qr") &&
          !(img.getAttribute("src") || "").includes("scan.png"),
      );

    if (!target || isReady(target)) return;

    await new Promise<void>((resolve) => {
      const done = () => resolve();
      if (target instanceof HTMLImageElement) {
        target.addEventListener("load", done, { once: true });
        target.addEventListener("error", done, { once: true });
      }
      setTimeout(done, 3000);
    });
  });
}

/** 导出登录页截图到 data/weibo-login-debug 便于排查白图问题 */
export async function saveLoginQrDebug(
  page: any,
  element: any | null,
  label: string,
): Promise<string> {
  await fs.mkdir(LOGIN_QR_DEBUG_DIR, { recursive: true });
  const stamp = `${label}-${Date.now()}`;
  const meta: Record<string, unknown> = { label, savedAt: new Date().toISOString() };

  try {
    const pageShot = await page.screenshot();
    const pagePath = path.join(LOGIN_QR_DEBUG_DIR, `${stamp}-page.png`);
    await fs.writeFile(pagePath, pageShot);
    meta.pageScreenshot = pagePath;
  } catch (error) {
    meta.pageScreenshotError = String(error);
  }

  if (element) {
    try {
      meta.elementInfo = await element.evaluate((el: Element) => {
        const img =
          el instanceof HTMLImageElement
            ? el
            : el.querySelector("img, canvas");
        return {
          tagName: el.tagName,
          className: (el as HTMLElement).className || "",
          id: el.id || "",
          src:
            img instanceof HTMLImageElement
              ? img.currentSrc || img.src
              : img instanceof HTMLCanvasElement
                ? "<canvas>"
                : null,
          width:
            img instanceof HTMLImageElement
              ? img.naturalWidth
              : img instanceof HTMLCanvasElement
                ? img.width
                : null,
          height:
            img instanceof HTMLImageElement
              ? img.naturalHeight
              : img instanceof HTMLCanvasElement
                ? img.height
                : null,
        };
      });
    } catch (error) {
      meta.elementInfoError = String(error);
    }

    try {
      const elementShot = await element.screenshot();
      const elementPath = path.join(LOGIN_QR_DEBUG_DIR, `${stamp}-qr-element.png`);
      await fs.writeFile(elementPath, elementShot);
      meta.elementScreenshot = elementPath;
    } catch (error) {
      meta.elementScreenshotError = String(error);
    }

    try {
      const box = await element.boundingBox();
      if (box?.width && box?.height) {
        meta.boundingBox = box;
        const clipShot = await page.screenshot({
          clip: {
            x: box.x,
            y: box.y,
            width: Math.ceil(box.width),
            height: Math.ceil(box.height),
          },
        });
        const clipPath = path.join(LOGIN_QR_DEBUG_DIR, `${stamp}-qr-clip.png`);
        await fs.writeFile(clipPath, clipShot);
        meta.clipScreenshot = clipPath;
      }
    } catch (error) {
      meta.clipScreenshotError = String(error);
    }
  }

  const metaPath = path.join(LOGIN_QR_DEBUG_DIR, `${stamp}-meta.json`);
  await fs.writeFile(metaPath, JSON.stringify(meta, null, 2), "utf-8");
  meta.metaFile = metaPath;
  return LOGIN_QR_DEBUG_DIR;
}

const bufferToDataUrl = (buffer: Buffer) =>
  `data:image/png;base64,${buffer.toString("base64")}`;

/** 切换到扫码登录并等待二维码出现 */
export async function captureLoginQrFromPage(
  page: any,
  timeoutMs = 15000,
): Promise<{
  dataUrl: string | null;
  detected: boolean;
  debugDir?: string;
}> {
  for (let i = 0; i < 3; i++) {
    await clickWeiboQrLoginTab(page);
    await wait(1000);
    const qrResult = await captureQrFromPage(page, 5000, `attempt-${i + 1}`);
    if (qrResult.detected) return qrResult;
  }
  return captureQrFromPage(page, timeoutMs, "final");
}

export async function captureQrFromPage(
  page: any,
  timeoutMs = 1500,
  debugLabel = "capture",
): Promise<{
  dataUrl: string | null;
  detected: boolean;
  debugDir?: string;
}> {
  let element: any = null;
  try {
    element = await waitForQrElement(page, timeoutMs);
    if (!element) {
      const debugDir = await saveLoginQrDebug(page, null, `${debugLabel}-missing`);
      return { dataUrl: null, detected: false, debugDir };
    }

    await waitForQrElementReady(page);
    const debugDir = await saveLoginQrDebug(page, element, debugLabel);

    const box = await element.boundingBox();
    if (box?.width && box?.height) {
      const clipBuffer = await page.screenshot({
        clip: {
          x: box.x,
          y: box.y,
          width: Math.ceil(box.width),
          height: Math.ceil(box.height),
        },
      });
      return {
        dataUrl: bufferToDataUrl(Buffer.from(clipBuffer)),
        detected: true,
        debugDir,
      };
    }

    const elementBuffer = await element.screenshot();
    return {
      dataUrl: bufferToDataUrl(Buffer.from(elementBuffer)),
      detected: true,
      debugDir,
    };
  } catch (error) {
    const debugDir = await saveLoginQrDebug(
      page,
      element,
      `${debugLabel}-error`,
    ).catch(() => LOGIN_QR_DEBUG_DIR);
    console.error("captureQrFromPage failed:", error, "debugDir:", debugDir);
    return { dataUrl: null, detected: false, debugDir };
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

    const qrResult = await captureLoginQrFromPage(
      page,
      opts.timeoutMs ? Math.min(opts.timeoutMs, 15000) : 15000,
    );
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
