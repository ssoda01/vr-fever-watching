import { $, Context, Session } from "koishi";
import type { Config } from "../index";
import { CONSTANTS } from "../util/constants";
import { formatPuppeteerError } from "../util/puppeteer";
import { saveScreenshotDebug } from "../util/save-screenshot";
import { sendImg, sendMsg } from "../util/send-msg";
import { attachCommentsToEntries } from "./comment";
import { drawEntryImages, type TimelineEntry } from "./drawer";
import {
  getLikeCursor,
  takeNewerLikes,
  upsertLikeCursor,
} from "./like-cursor";
import {
  filterTimelineWithinMinutes,
  formatEntryMessages,
  normalizeLikeList,
  normalizeMymblogTimeline,
} from "./timeline";
import type { ProfileData } from "./drawer/types";
import type { NormalizedPost } from "./timeline";
import { formatWeiboHttpError, getWeiboByUID } from "./weibo";

type SendMsgSession = {
  sendQueued: (content: any) => Promise<any>;
};

type UidPayload = {
  profile: ProfileData;
  ownPosts: NormalizedPost[];
  likes: NormalizedPost[];
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

    const payloadByUID = new Map<string, UidPayload | null>();
    await Promise.all(
      weiboUIDs.map(async (weiboUID) => {
        let result: Awaited<ReturnType<typeof getWeiboByUID>> = null;
        try {
          result = await getWeiboByUID(weiboUID, ctx);
        } catch (error) {
          ctx.logger.error(
            `[weibo api] 拉取失败 uid=${weiboUID} ${formatWeiboHttpError(error)}`,
          );
          payloadByUID.set(weiboUID, null);
          return;
        }
        if (!result?.profile || !result?.timeline) {
          ctx.logger.warn(
            `[weibo api] 数据不完整 uid=${weiboUID} profile=${Boolean(result?.profile)} timeline=${Boolean(result?.timeline)}`,
          );
          payloadByUID.set(weiboUID, null);
          return;
        }

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

        const ownPosts = filterTimelineWithinMinutes(
          normalizeMymblogTimeline(result.timeline, weiboUID),
          config.waitMinutes,
        );
        const likes = normalizeLikeList(result.like);

        payloadByUID.set(weiboUID, {
          profile: result.profile,
          ownPosts,
          likes,
        });
      }),
    );

    // 评论只挂在原创/转发上；先拼临时 TimelineEntry 复用现有拉取逻辑
    const entryByUID = new Map<string, TimelineEntry | null>();
    for (const [weiboUID, payload] of payloadByUID) {
      entryByUID.set(
        weiboUID,
        payload
          ? { profile: payload.profile, timeline: payload.ownPosts }
          : null,
      );
    }
    await attachCommentsToEntries(ctx, entryByUID, config.waitMinutes);
    for (const [weiboUID, entry] of entryByUID) {
      const payload = payloadByUID.get(weiboUID);
      if (payload && entry) {
        payload.ownPosts = entry.timeline;
      }
    }

    for (const group of groups) {
      const session = sendMsgOnebot(group.groupID);

      for (const weiboUID of [...new Set(group.weiboUIDs)]) {
        const payload = payloadByUID.get(weiboUID);
        if (!payload) continue;

        try {
          const cursor = await getLikeCursor(ctx, weiboUID, group.groupID);
          const { newer, needSeed } = takeNewerLikes(
            payload.likes,
            cursor?.lastLikeId,
          );

          const timeline = [...payload.ownPosts, ...newer].sort(
            (a, b) => (b.activityAtTime ?? 0) - (a.activityAtTime ?? 0),
          );

          const newestLikeId = payload.likes[0]
            ? String(payload.likes[0].id)
            : null;

          if (!timeline.length) {
            if (needSeed && newestLikeId) {
              await upsertLikeCursor(
                ctx,
                weiboUID,
                group.groupID,
                newestLikeId,
              );
              ctx.logger.info(
                `点赞游标已初始化: uid=${weiboUID} group=${group.groupID} lastLikeId=${newestLikeId}`,
              );
            }
            continue;
          }

          const entry: TimelineEntry = {
            profile: payload.profile,
            timeline,
          };
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
          } else {
            const images = await drawEntryImages(ctx, entry);
            const uid = String(
              entry.profile.user?.idstr ||
                entry.profile.user?.id ||
                "unknown",
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
              await sendImg(ctx, image, session as Session, config.imageBaseUrl);
            }
          }

          // 推送成功后再推进点赞游标（含首次种子化）
          if ((newer.length || needSeed) && newestLikeId) {
            await upsertLikeCursor(ctx, weiboUID, group.groupID, newestLikeId);
            if (newer.length) {
              ctx.logger.info(
                `点赞游标已更新: uid=${weiboUID} group=${group.groupID} lastLikeId=${newestLikeId} (+${newer.length})`,
              );
            }
          }
        } catch (error) {
          ctx.logger.warn(formatPuppeteerError(error));
        }
      }
    }
  };
};
