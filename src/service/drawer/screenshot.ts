import { Context, h } from "koishi";
import { CONSTANTS } from "../../util/constants";
import {
  ensurePuppeteerBrowser,
  parsePuppeteerRenderOutput,
} from "../../util/puppeteer";
import type { NormalizedPost } from "../timeline/types";
import {
  buildMultiTimelineHtml,
  buildTimelineHtml,
} from "./html-builder";
import { prepareDrawerAssets } from "./image-resolver";
import type { ProfileData, TimelineEntry } from "./types";

const chunkTimeline = <T>(items: T[], size: number): T[][] => {
  if (!items.length) return [];
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
};

const waitForImages = async (page: any, timeoutMs: number) => {
  await page.evaluate((timeout) => {
    const withTimeout = (promise: Promise<unknown>) =>
      Promise.race([
        promise,
        new Promise<void>((resolve) => setTimeout(resolve, timeout)),
      ]);

    const waitFonts = document.fonts?.ready
      ? withTimeout(document.fonts.ready)
      : Promise.resolve();

    const waitImage = (img: HTMLImageElement) =>
      new Promise<void>((resolve) => {
        if (img.complete && img.naturalWidth > 0) return resolve();
        const done = () => resolve();
        img.addEventListener("load", done, { once: true });
        img.addEventListener("error", done, { once: true });
        setTimeout(done, timeout);
      });

    return Promise.all([
      waitFonts,
      ...Array.from(document.images).map(waitImage),
    ]);
  }, timeoutMs);
};

const toImageBuffer = (output: unknown) => {
  if (Buffer.isBuffer(output)) return output;
  if (output instanceof Uint8Array) return Buffer.from(output);
  return null;
};

const toClip = (box: { x: number; y: number; width: number; height: number }) => ({
  x: Math.max(0, Math.floor(box.x)),
  y: Math.max(0, Math.floor(box.y)),
  width: Math.max(1, Math.ceil(box.width)),
  height: Math.max(1, Math.ceil(box.height)),
});

const screenshotSelector = async (page: any, selector: string) => {
  await waitForImages(page, CONSTANTS.IMAGE_LOAD_TIMEOUT_MS);
  const el = await page.$(selector);
  if (!el) return null;
  let box = await el.boundingBox();
  if (!box || box.width < 1 || box.height < 1) return null;

  await page.setViewport({
    width: Math.max(400, Math.ceil(box.width) + 48),
    height: Math.max(800, Math.min(1200, Math.ceil(box.height) + 48)),
    deviceScaleFactor: CONSTANTS.SCREENSHOT_DPR,
  });
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));

  box = await el.boundingBox();
  if (!box || box.width < 1 || box.height < 1) return null;

  const longEdge =
    Math.max(box.width, box.height) * CONSTANTS.SCREENSHOT_DPR;
  if (longEdge > CONSTANTS.SCREENSHOT_MAX_EDGE) {
    const zoom = CONSTANTS.SCREENSHOT_MAX_EDGE / longEdge;
    await el.evaluate((node: HTMLElement, z: number) => {
      node.style.zoom = String(z);
    }, zoom);
    box = await el.boundingBox();
    if (!box || box.width < 1 || box.height < 1) return null;
  }

  const output = await page.screenshot({
    type: "jpeg",
    quality: 80,
    captureBeyondViewport: true,
    clip: toClip(box),
  });
  return toImageBuffer(output);
};

const renderSelector = async (page: any, selector: string) => {
  const buffer = await screenshotSelector(page, selector);
  if (!buffer) return "";
  return h.image(buffer, "image/jpeg").toString();
};

const renderHtmlAsImage = async (
  ctx: Context,
  html: string,
  selector: string,
) => {
  const output = await ctx.puppeteer.render(html, async (page) => {
    return renderSelector(page, selector);
  });
  if (!output) return null;
  return parsePuppeteerRenderOutput(output);
};

export const drawTimeline = async (
  ctx: Context,
  profile: ProfileData,
  normalizedTimeline: NormalizedPost[],
) => {
  await ensurePuppeteerBrowser(ctx);
  const { profile: resolvedProfile, timeline: resolvedTimeline, faceSrc } =
    await prepareDrawerAssets(ctx, profile, normalizedTimeline);
  const html = buildTimelineHtml(resolvedProfile, resolvedTimeline, faceSrc);
  return renderHtmlAsImage(ctx, html, ".weibo-card");
};

/** 单个博主截图：微博过多时按 POSTS_PER_SCREENSHOT 条拆成多张图 */
export const drawEntryImages = async (
  ctx: Context,
  entry: TimelineEntry,
): Promise<Buffer[]> => {
  const chunks = chunkTimeline(
    entry.timeline,
    CONSTANTS.POSTS_PER_SCREENSHOT,
  );
  const images: Buffer[] = [];
  for (const chunk of chunks) {
    const image = await drawTimeline(ctx, entry.profile, chunk);
    if (image) {
      images.push(image);
    }
  }
  return images;
};

export const drawTimelines = async (ctx: Context, entries: TimelineEntry[]) => {
  if (!entries.length) return null;
  if (entries.length === 1) {
    return drawTimeline(ctx, entries[0].profile, entries[0].timeline);
  }

  await ensurePuppeteerBrowser(ctx);
  const resolvedEntries = [];
  for (const entry of entries) {
    resolvedEntries.push(
      await prepareDrawerAssets(ctx, entry.profile, entry.timeline),
    );
  }
  const html = buildMultiTimelineHtml(resolvedEntries);
  return renderHtmlAsImage(ctx, html, "#weibo-cards");
};
