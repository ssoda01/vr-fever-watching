import { Context, h } from "koishi";
import { CONSTANTS } from "../../util/constants";
import { ensurePuppeteerBrowser } from "../../util/puppeteer";
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

type SliceRange = { top: number; height: number };
type PostBox = { top: number; height: number };

const maxSliceCssHeight = () =>
  Math.max(1, Math.floor(CONSTANTS.SCREENSHOT_MAX_EDGE / CONSTANTS.SCREENSHOT_DPR));

/** 优先按微博卡片切开；单条仍超高再竖直切片，避免整图缩放 */
const planScreenshotSlices = (
  totalHeight: number,
  posts: PostBox[],
  maxHeight: number,
): SliceRange[] => {
  if (totalHeight <= maxHeight) {
    return [{ top: 0, height: totalHeight }];
  }

  const slices: SliceRange[] = [];
  const flush = (top: number, end: number) => {
    const height = end - top;
    if (height < 1) return;
    if (height <= maxHeight) {
      slices.push({ top, height });
      return;
    }
    let y = top;
    while (y < end - 0.5) {
      const h = Math.min(maxHeight, end - y);
      slices.push({ top: y, height: h });
      y += h;
    }
  };

  let sliceTop = 0;
  let sliceEnd = posts[0]?.top ?? 0;

  for (const post of posts) {
    const postEnd = post.top + post.height;
    if (postEnd - sliceTop <= maxHeight) {
      sliceEnd = postEnd;
      continue;
    }
    flush(sliceTop, sliceEnd > sliceTop ? sliceEnd : post.top);
    sliceTop = post.top;
    sliceEnd = postEnd;
  }
  flush(sliceTop, Math.max(sliceEnd, totalHeight));
  return slices.length ? slices : [{ top: 0, height: totalHeight }];
};

const screenshotSelector = async (page: any, selector: string) => {
  await waitForImages(page, CONSTANTS.IMAGE_LOAD_TIMEOUT_MS);
  const el = await page.$(selector);
  if (!el) return [];
  let box = await el.boundingBox();
  if (!box || box.width < 1 || box.height < 1) return [];

  await page.setViewport({
    width: Math.max(400, Math.ceil(box.width) + 48),
    height: Math.max(800, Math.min(Math.ceil(box.height) + 48, 8000)),
    deviceScaleFactor: CONSTANTS.SCREENSHOT_DPR,
  });
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));

  box = await el.boundingBox();
  if (!box || box.width < 1 || box.height < 1) return [];

  const layout = (await page.evaluate((sel: string) => {
    const root = document.querySelector(sel);
    if (!root) return null;
    const rootRect = root.getBoundingClientRect();
    const posts = Array.from(root.querySelectorAll(".post")).map((node) => {
      const rect = node.getBoundingClientRect();
      return {
        top: rect.top - rootRect.top,
        height: rect.height,
      };
    });
    return { height: rootRect.height, posts };
  }, selector)) as { height: number; posts: PostBox[] } | null;

  const ranges = planScreenshotSlices(
    layout?.height || box.height,
    layout?.posts || [],
    maxSliceCssHeight(),
  );

  const buffers: Buffer[] = [];
  for (const range of ranges) {
    const output = await page.screenshot({
      type: "jpeg",
      quality: CONSTANTS.SCREENSHOT_JPEG_QUALITY,
      captureBeyondViewport: true,
      clip: toClip({
        x: box.x,
        y: box.y + range.top,
        width: box.width,
        height: range.height,
      }),
    });
    const buffer = toImageBuffer(output);
    if (buffer) buffers.push(buffer);
  }
  return buffers;
};

const renderHtmlAsImages = async (
  ctx: Context,
  html: string,
  selector: string,
) => {
  const buffers: Buffer[] = [];
  await ctx.puppeteer.render(html, async (page) => {
    const slices = await screenshotSelector(page, selector);
    buffers.push(...slices);
    if (!slices[0]) return "";
    return h.image(slices[0], "image/jpeg").toString();
  });
  return buffers;
};

const drawTimelineSlices = async (
  ctx: Context,
  profile: ProfileData,
  normalizedTimeline: NormalizedPost[],
) => {
  await ensurePuppeteerBrowser(ctx);
  const { profile: resolvedProfile, timeline: resolvedTimeline, faceSrc } =
    await prepareDrawerAssets(ctx, profile, normalizedTimeline);
  const html = buildTimelineHtml(resolvedProfile, resolvedTimeline, faceSrc);
  return renderHtmlAsImages(ctx, html, ".weibo-card");
};

export const drawTimeline = async (
  ctx: Context,
  profile: ProfileData,
  normalizedTimeline: NormalizedPost[],
) => {
  const images = await drawTimelineSlices(ctx, profile, normalizedTimeline);
  return images[0] ?? null;
};

/** 单个博主截图：微博过多时按 POSTS_PER_SCREENSHOT 条拆成多张图，超长再按高度切开 */
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
    images.push(...(await drawTimelineSlices(ctx, entry.profile, chunk)));
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
  const images = await renderHtmlAsImages(ctx, html, "#weibo-cards");
  return images[0] ?? null;
};
