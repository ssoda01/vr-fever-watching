import fs from "node:fs/promises";
import path from "node:path";
import { wait } from "../../util/timer";

const LOGIN_QR_DEBUG_DIR = path.join(process.cwd(), "data", "weibo-login-debug");

export type QrCaptureResult = {
  dataUrl: string | null;
  detected: boolean;
  debugDir?: string;
};

/** 微博登录页默认可能是短信登录，需先点击 scan.png 图标所在父 span 切换到「扫码登录」 */
async function clickWeiboQrLoginTab(page: any): Promise<boolean> {
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

async function getQrElement(page: any) {
  const selectors = [
    'img[src*="qr"]:not([src*="scan.png"])',
    'img[src*="qrcode"]',
    'img[alt*="二维码"]',
    'img[alt*="QR"]',
    'img[alt*="Scan"]',
    ".qrcode img",
    ".qr img",
    '[class*="qr"] img',
    '[class*="qrcode"] img',
    '[class*="QR"] img',
    '[class*="Qr"] img',
    '[class*="qr"] canvas',
    '[class*="qrcode"] canvas',
    "canvas",
    ".qrcode",
    ".qr",
    '[class*="qr"]',
    '[class*="qrcode"]',
    '[id*="qr"]',
    '[data-role="qrcode"]',
    '[data-type="qrcode"]',
    'div[class*="qrcode"]',
    'section[class*="qrcode"]',
  ];

  for (const sel of selectors) {
    const el = await page.$(sel);
    if (el) {
      const boundingBox = await el.boundingBox();
      if (boundingBox && boundingBox.width > 100 && boundingBox.height > 100) {
        return el;
      }
    }
  }

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

  const allImages = await page.$$("img, canvas");
  for (const img of allImages) {
    const boundingBox = await img.boundingBox();
    if (boundingBox && boundingBox.width > 100 && boundingBox.height > 100) {
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
    const isReady = (node: Element): boolean => {
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

async function saveLoginQrDebug(
  page: any,
  element: any | null,
  label: string,
  saveDebug = false,
): Promise<string | null> {
  if (!saveDebug) return null;

  await fs.mkdir(LOGIN_QR_DEBUG_DIR, { recursive: true });
  const stamp = `${label}-${Date.now()}`;
  const meta: Record<string, unknown> = {
    label,
    savedAt: new Date().toISOString(),
  };

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
      const elementPath = path.join(
        LOGIN_QR_DEBUG_DIR,
        `${stamp}-qr-element.png`,
      );
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
  return LOGIN_QR_DEBUG_DIR;
}

const bufferToDataUrl = (buffer: Buffer) =>
  `data:image/png;base64,${buffer.toString("base64")}`;

async function captureQrFromPage(
  page: any,
  timeoutMs = 1500,
  debugLabel = "capture",
  saveDebug = false,
): Promise<QrCaptureResult> {
  let element: any = null;
  try {
    element = await waitForQrElement(page, timeoutMs);
    if (!element) {
      const debugDir = await saveLoginQrDebug(
        page,
        null,
        `${debugLabel}-missing`,
        saveDebug,
      );
      return { dataUrl: null, detected: false, debugDir: debugDir ?? undefined };
    }

    await waitForQrElementReady(page);
    const debugDir = await saveLoginQrDebug(
      page,
      element,
      debugLabel,
      saveDebug,
    );

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
        debugDir: debugDir ?? undefined,
      };
    }

    const elementBuffer = await element.screenshot();
    return {
      dataUrl: bufferToDataUrl(Buffer.from(elementBuffer)),
      detected: true,
      debugDir: debugDir ?? undefined,
    };
  } catch (error) {
    const debugDir = await saveLoginQrDebug(
      page,
      element,
      `${debugLabel}-error`,
      saveDebug,
    ).catch(() => null);
    console.error("captureQrFromPage failed:", error, "debugDir:", debugDir);
    return { dataUrl: null, detected: false, debugDir: debugDir ?? undefined };
  }
}

/** 切换到扫码登录并等待二维码出现 */
export async function captureLoginQrFromPage(
  page: any,
  timeoutMs = 15000,
  saveDebug = false,
): Promise<QrCaptureResult> {
  for (let i = 0; i < 3; i++) {
    await clickWeiboQrLoginTab(page);
    await wait(1000);
    const qrResult = await captureQrFromPage(
      page,
      5000,
      `attempt-${i + 1}`,
      saveDebug,
    );
    if (qrResult.detected) return qrResult;
  }
  return captureQrFromPage(page, timeoutMs, "final", saveDebug);
}
