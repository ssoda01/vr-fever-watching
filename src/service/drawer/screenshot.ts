import { Context } from "koishi";
import { CONSTANTS } from "../../util/constants";
import { ensurePuppeteerBrowser } from "../../util/puppeteer-cookie";
import type { NormalizedPost } from "../timeline/types";
import {
  buildMultiTimelineHtml,
  buildTimelineHtml,
} from "./html-builder";
import { prepareDrawerAssets } from "./image-resolver";
import type { ProfileData, TimelineEntry } from "./types";

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
  return ctx.puppeteer.render(html, async (page, next) => {
    await waitForImages(page, CONSTANTS.IMAGE_LOAD_TIMEOUT_MS);
    const card = await page.$(".weibo-card");
    return next(card || undefined);
  });
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
  return ctx.puppeteer.render(html, async (page, next) => {
    await waitForImages(page, CONSTANTS.IMAGE_LOAD_TIMEOUT_MS);
    const cards = await page.$("#weibo-cards");
    return next(cards || undefined);
  });
};
