import { Channel, Context } from "koishi";
import type Puppeteer from "koishi-plugin-puppeteer";
import type { Config } from "../index";
import { checkLoginStatus, getQRcode } from "../service/login";
// import { formatCommentsMessages } from "../service/comment/formatter";
// import { getWeiboCommentsByWeiboID } from "../service/weibo-fetch";
import { REGEX } from "../util/constants";
import {
  ensurePuppeteerBrowser,
  formatPuppeteerError,
} from "../util/puppeteer-cookie";
import { sendMsg } from "../util/send-msg";
export interface WeiboContext extends Context {
  puppeteer: Puppeteer;
}
export const registerWeiboCommand = (
  ctx: WeiboContext,
  config: Config,
  pollWeibo: () => Promise<void>,
) => {
  ctx.command("weibo <message>").action(async (argv, message) => {
    if (!ctx?.puppeteer) {
      return "please install puppeteer plugin";
    }

    if (message === "list") {
      const groupID = (argv.session?.channel as unknown as Channel)
        .id as string;
      const subscribes = await ctx.database
        .select("weibo_subscribes")
        .where({ groupID, isActive: true })
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
      const bot = ctx.bots[`onebot:${config.adminAccount.trim()}`];
      return;
      return bot.sendMessage(groupID, msg.join("\n"));
    }

    if (message === "add") {
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

    if (message === "remove") {
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
      return bot.sendMessage(groupID, `移除订阅成功: ${weiboUID}`);
    }

    if (message === "help") {
      sendMsg(
        [
          "weibo 命令帮助：",
          "💚",
          "help - 显示本帮助",
          "list - 查看本群订阅列表",
          "add <UID> - 订阅博主",
          "remove <UID> - 取消订阅",
          "login - 扫码登录微博",
          "pull - 立即拉取一次微博卡片",
          "💚",
          "weibo list",
          "weibo add 8376019184",
          "weibo remove 1234567890",
          "weibo login",
          "weibo pull",
        ].join("\n"),
        argv.session,
      );
    }
    console.log(message);
    if (message === "login") {
      try {
        await ensurePuppeteerBrowser(ctx);
        await getQRcode(ctx, argv.session);
      } catch (error) {
        sendMsg(formatPuppeteerError(error), argv.session);
      }
    }

    // if (message === "cookie") {
    //   const cookies = await loadCookiesFromDatabase(ctx);
    //   if (!cookies || cookies.length === 0) {
    //     return argv.session.sendQueued("no cookies found");
    //   }
    //   return argv.session.sendQueued(JSON.stringify(cookies));
    // }

    // if (message === "comments") {
    //   try {
    //     let [, weiboUID, weiboID] = argv.args;
    //     weiboUID = weiboUID?.trim();
    //     weiboID = weiboID?.trim();
    //     if (
    //       !weiboUID ||
    //       !REGEX.IS_WEIBO_UID.test(weiboUID) ||
    //       !weiboID ||
    //       !/^\d+$/.test(weiboID)
    //     ) {
    //       return argv.session.sendQueued("请输入正确格式的UID和微博ID");
    //     }
    //     const result = await getWeiboCommentsByWeiboID(weiboID, weiboUID, ctx);
    //     if (!result?.comments.length) {
    //       return argv.session.sendQueued("未找到评论数据");
    //     }
    //     for (const msg of formatCommentsMessages(result)) {
    //       await argv.session.sendQueued(msg);
    //     }
    //     return;
    //   } catch (error: any) {
    //     return argv.session.sendQueued(error.message);
    //   }
    // }

    if (message === "立刻获取") {
      try {
        await pollWeibo();
      } catch (error: any) {
        return argv.session.sendQueued(formatPuppeteerError(error));
      }
    }
    if (message === "check") {
      try {
        const loginStatus = await checkLoginStatus(ctx);
        if (loginStatus) {
          return argv.session.sendQueued("微博登录状态正常");
        } else {
          return argv.session.sendQueued("微博登录状态异常");
        }
      } catch (error: any) {
        return argv.session.sendQueued(formatPuppeteerError(error));
      }
    }
    return;
  });
};
