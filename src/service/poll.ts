import { $, Context, Session } from "koishi";
import type { Config } from "../index";
import { CONSTANTS } from "../util/constants";
import { formatPuppeteerError } from "../util/puppeteer";
import { saveScreenshotDebug } from "../util/save-screenshot";
import { sendImg, sendMsg } from "../util/send-msg";
import { attachCommentsToEntries } from "./comment";
import { drawEntryImages, type TimelineEntry } from "./drawer";
import {
  filterTimelineWithinMinutes,
  formatEntryMessages,
  mergeActivityTimeline,
} from "./timeline";
import { formatWeiboHttpError, getWeiboByUID } from "./weibo";

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
    ctx.logger.info("拉一轮订阅");

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
        let result: Awaited<ReturnType<typeof getWeiboByUID>> = null;
        try {
          result = await getWeiboByUID(weiboUID, ctx);
        } catch (error) {
          ctx.logger.error(
            `[weibo api] 拉取失败 uid=${weiboUID} ${formatWeiboHttpError(error)}`,
          );
          entryByUID.set(weiboUID, null);
          return;
        }
        if (!result?.profile || !result?.timeline) {
          ctx.logger.warn(
            `[weibo api] 数据不完整 uid=${weiboUID} profile=${Boolean(result?.profile)} timeline=${Boolean(result?.timeline)}`,
          );
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

      for (const entry of entries) {
        try {
          const name =
            entry.profile.user?.screen_name ||
            String(
              entry.profile.user?.idstr ||
                entry.profile.user?.id ||
                "unknown",
            );

          if (config.isTextMode) {
            const messages = formatEntryMessages(entry);
            for (const message of messages) {
              await sendMsg(message, session as Session);
            }
            ctx.logger.info(`文本已推送: ${name} (${messages.length} 条)`);
            continue;
          }

          const images = await drawEntryImages(ctx, entry);
          const uid = String(
            entry.profile.user?.idstr || entry.profile.user?.id || "unknown",
          );

          for (let i = 0; i < images.length; i++) {
            const image = images[i];
            const postCount = Math.min(
              CONSTANTS.POSTS_PER_SCREENSHOT,
              entry.timeline.length - i * CONSTANTS.POSTS_PER_SCREENSHOT,
            );
            const saved = config.isDebugMode
              ? await saveScreenshotDebug(image, {
                  uid,
                  name,
                  chunkIndex: i,
                  totalChunks: images.length,
                  postCount,
                })
              : null;
            if (saved) {
              ctx.logger.info(
                `截图已保存: ${saved.filePath} (${saved.sizeKB} KB, ${name} ${i + 1}/${images.length})`,
              );
            }
            await sendImg(image, session as Session);
          }
        } catch (error) {
          ctx.logger.warn(formatPuppeteerError(error));
        }
      }
    }
  };
};
