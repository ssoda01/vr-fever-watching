import { Channel, Context } from "koishi";
import type { Config } from "../index";
import { getQRcode } from "../service/login";
import {
  filterTimelineWithinMinutes,
  mergeActivityTimeline,
} from "../service/timeline";
import { formatCommentsMessages } from "../service/comment/formatter";
import {
  getWeiboByUID,
  getWeiboCommentsByWeiboID,
} from "../service/weibo-fetch";
import { CONSTANTS, REGEX } from "../util/constants";
import {
  ensurePuppeteerBrowser,
  formatPuppeteerError,
  loadCookiesFromDatabase,
} from "../util/puppeteer-cookie";
import { sendMsg } from "../util/send-msg";

export const registerTestCommand = (
  ctx: Context,
  config: Config,
  pollWeibo: () => Promise<void>,
) => {
  ctx.command("test <message> <options>").action(async (argv, message) => {
    if (!ctx.puppeteer) {
      return "please install puppeteer plugin";
    }

    if (message === "查询") {
      const groupID = (argv.session?.channel as unknown as Channel)
        .id as string;
      const subscribes = await ctx.database
        .select("weibo_subscribes")
        .where({ groupID })
        .execute();
      if (!subscribes) {
        return argv.session.sendQueued("未找到订阅");
      }
      const msg = ["当前订阅的UID:"];
      Array.from(subscribes).forEach((subscribe) => {
        msg.push(
          `- ${subscribe.isActive ? "💚" : "🩶"} ${subscribe.weiboUID} ${subscribe.weiboName} `,
        );
      });
      return argv.session.sendQueued(msg.join("\n"));
    }

    if (message === "订阅") {
      let [, weiboUID] = argv.args;
      weiboUID = weiboUID?.trim();
      if (!weiboUID || !REGEX.IS_WEIBO_UID.test(weiboUID)) {
        return argv.session.sendQueued("请输入正确格式的UID");
      }
      const groupID = (argv.session?.channel as unknown as Channel)
        .id as string;
      if (!groupID) {
        return argv.session.sendQueued("未找到群ID");
      }
      const beforeSubscribe = await ctx.database
        .select("weibo_subscribes")
        .where({ id: `${weiboUID}-${groupID}` })
        .execute();
      if (beforeSubscribe.length > 0) {
        return argv.session.sendQueued("已订阅，无需重复订阅");
      }

      await ctx.database.create("weibo_subscribes", {
        id: `${weiboUID}-${groupID}`,
        weiboUID,
        groupID,
        isActive: true,
        createdAt: new Date(),
      });

      const bot = ctx.bots[`onebot:${config.adminAccount.trim()}`];
      return bot.sendMessage(groupID, `订阅成功: ${weiboUID}`);
    }

    if (message === "取消订阅") {
      let [, weiboUID] = argv.args;
      weiboUID = weiboUID?.trim();
      if (!weiboUID || !REGEX.IS_WEIBO_UID.test(weiboUID)) {
        return argv.session.sendQueued("请输入正确格式的UID");
      }
      const groupID = (argv.session?.channel as unknown as Channel)
        .id as string;
      if (!groupID) {
        return argv.session.sendQueued("未找到群ID");
      }
      const beforeSubscribe = await ctx.database
        .select("weibo_subscribes")
        .where({ id: `${weiboUID}-${groupID}` })
        .execute();
      if (beforeSubscribe.length === 0) {
        return argv.session.sendQueued("未找到订阅，无需取消订阅");
      }
      argv.session.sendQueued(
        `正在取消订阅.../nUID: ${weiboUID} ${beforeSubscribe[0].weiboName}`,
      );

      await ctx.database.set(
        "weibo_subscribes",
        {
          weiboUID,
          groupID,
        },
        {
          isActive: false,
        },
      );

      const bot = ctx.bots[`onebot:${config.adminAccount.trim()}`];
      return bot.sendMessage(groupID, `订阅成功: ${weiboUID}`);
    }

    if (message === "help") {
      sendMsg(
        "help: 帮助\rlogin: 登录\rcookie: 获取cookie\rcatch: 获取微博数据\rcomments: 获取微博评论\rdraw: 绘制微博卡片",
        argv.session,
      );
    }

    if (message === "login") {
      try {
        await ensurePuppeteerBrowser(ctx);
        await getQRcode(ctx, argv.session);
      } catch (error) {
        sendMsg(formatPuppeteerError(error), argv.session);
      }
    }

    if (message === "cookie") {
      const cookies = await loadCookiesFromDatabase(ctx);
      if (!cookies || cookies.length === 0) {
        return argv.session.sendQueued("no cookies found");
      }
      return argv.session.sendQueued(JSON.stringify(cookies));
    }

    if (message == "catch") {
      try {
        const result = await getWeiboByUID(
          CONSTANTS.WEIBO_SAMPLE_UID,
          ctx,
          argv.session,
        );
        if (!result?.profile || !result?.timeline) {
          return argv.session.sendQueued("未找到微博数据");
        }
        const normalizedTimeline = filterTimelineWithinMinutes(
          mergeActivityTimeline(
            result.timeline,
            result.like,
            CONSTANTS.WEIBO_SAMPLE_UID,
          ),
          CONSTANTS.TIME_SCOPE_MINUTES,
        );
        return argv.session.sendQueued(JSON.stringify({ normalizedTimeline }));
      } catch (error: any) {
        return argv.session.sendQueued(error.message);
      }
    }

    if (message === "comments") {
      try {
        let [, weiboUID, weiboID] = argv.args;
        weiboUID = weiboUID?.trim();
        weiboID = weiboID?.trim();
        if (
          !weiboUID ||
          !REGEX.IS_WEIBO_UID.test(weiboUID) ||
          !weiboID ||
          !/^\d+$/.test(weiboID)
        ) {
          return argv.session.sendQueued("请输入正确格式的UID和微博ID");
        }
        const result = await getWeiboCommentsByWeiboID(weiboID, weiboUID, ctx);
        if (!result?.comments.length) {
          return argv.session.sendQueued("未找到评论数据");
        }
        for (const msg of formatCommentsMessages(result)) {
          await argv.session.sendQueued(msg);
        }
        return;
      } catch (error: any) {
        return argv.session.sendQueued(error.message);
      }
    }

    if (message === "draw") {
      try {
        await pollWeibo();
      } catch (error: any) {
        return argv.session.sendQueued(formatPuppeteerError(error));
      }
    }

    return;
  });
};
