import { Context } from "koishi";
import { CONSTANTS } from "../../util/constants";
import { parsePuppeteerRenderOutput } from "../../util/parse-render-output";
import { ensurePuppeteerBrowser } from "../../util/puppeteer-cookie";
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
    const waitImage = (img: HTMLImageElement) =>
      new Promise<void>((resolve) => {
        if (img.complete && img.naturalWidth > 0) return resolve();
        const done = () => resolve();
        img.addEventListener("load", done, { once: true });
        img.addEventListener("error", done, { once: true });
        setTimeout(done, timeout);
      });

    return Promise.all(Array.from(document.images).map(waitImage));
  }, timeoutMs);
};

export const drawTimeline = async (
  ctx: Context,
  profile: ProfileData,
  normalizedTimeline: NormalizedPost[],
) => {
  await ensurePuppeteerBrowser(ctx);
  const { profile: resolvedProfile, timeline: resolvedTimeline } =
    await prepareDrawerAssets(ctx, profile, normalizedTimeline);
  const html = buildTimelineHtml(resolvedProfile, resolvedTimeline);
  const output = await ctx.puppeteer.render(html, async (page, next) => {
    await waitForImages(page, CONSTANTS.IMAGE_LOAD_TIMEOUT_MS);
    const card = await page.$(".weibo-card");
    return next(card || undefined);
  });
  return output ? parsePuppeteerRenderOutput(output) : null;
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
  const output = await ctx.puppeteer.render(html, async (page, next) => {
    await waitForImages(page, CONSTANTS.IMAGE_LOAD_TIMEOUT_MS);
    const cards = await page.$("#weibo-cards");
    return next(cards || undefined);
  });
  return output ? parsePuppeteerRenderOutput(output) : null;
};
