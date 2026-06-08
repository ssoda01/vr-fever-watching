import { $, Context } from "koishi";
import { drawTimelines, type TimelineEntry } from "./drawer";
import { filterTimelineWithinMinutes, mergeActivityTimeline } from "./timeline";
import { attachCommentsToEntries } from "./comment/fetch-for-timeline";
import { getWeiboByUID } from "./weibo-fetch";
import { formatPuppeteerError } from "../util/puppeteer-cookie";
import type { Config } from "../index";

type SendMsgSession = {
  sendQueued: (content: any) => Promise<any>;
};

/** 定时轮询所有活跃订阅，拉取微博并截图推送 */
export const createPollWeibo = (
  ctx: Context,
  config: Config,
  sendMsgOnebot: (groupId: string) => SendMsgSession,
) => {
  return async () => {
    ctx.logger.info("定时器开始");

    const groups = await ctx.database
      .select("weibo_subscribes")
      .where({ isActive: true })
      .groupBy("groupID", {
        weiboUIDs: (row) => $.array(row.weiboUID),
      })
      .orderBy("groupID", "desc")
      .limit(10)
      .execute();

    const weiboUIDs = [...new Set(groups.flatMap((group) => group.weiboUIDs))];
    if (!weiboUIDs.length) {
      return;
    }

    const entryByUID = new Map<string, TimelineEntry | null>();
    await Promise.all(
      weiboUIDs.map(async (weiboUID) => {
        const result = await getWeiboByUID(weiboUID, ctx);
        if (!result?.profile || !result?.timeline) {
          entryByUID.set(weiboUID, null);
          return;
        }

        // 更新数据库内的weiboName
        const weiboName = result?.profile?.user?.screen_name;
        if (weiboName?.trim()) {
          await ctx.database.set(
            "weibo_subscribes",
            {
              weiboUID: weiboUID,
            },
            {
              weiboName: weiboName,
            },
          );
        }
        if (!weiboName) {
          return;
        }

        const normalizedTimeline = filterTimelineWithinMinutes(
          mergeActivityTimeline(result.timeline, result.like, weiboUID),
          config.waitMinutes,
        );
        entryByUID.set(
          weiboUID,
          normalizedTimeline.length
            ? { profile: result.profile, timeline: normalizedTimeline }
            : null,
        );
      }),
    );
    await attachCommentsToEntries(ctx, entryByUID, config.waitMinutes);

    for (const group of groups) {
      const session = sendMsgOnebot(group.groupID);
      const entries = [...new Set(group.weiboUIDs)]
        .map((weiboUID) => entryByUID.get(weiboUID))
        .filter((entry): entry is TimelineEntry => entry != null);

      if (!entries.length) {
        continue;
      }

      try {
        const image = await drawTimelines(ctx, entries);
        if (image) {
          await session.sendQueued(image);
        }
      } catch (error) {
        ctx.logger.warn(formatPuppeteerError(error));
      }
    }
  };
};
