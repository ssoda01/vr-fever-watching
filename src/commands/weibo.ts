import { Channel, Context, Session } from "koishi";
import type Puppeteer from "koishi-plugin-puppeteer";
import type { Config } from "../index";
import { checkLoginStatus, getQRcode } from "../service/login";
import { REGEX } from "../util/constants";
import { formatPuppeteerError } from "../util/puppeteer";
import { sendMsg } from "../util/send-msg";

export interface WeiboContext extends Context {
  puppeteer: Puppeteer;
}

const HELP_TEXT = [
  "weibo 命令帮助：",
  "💚",
  "help - 显示本帮助",
  "list - 查看本群订阅列表",
  "add <UID> - 订阅博主",
  "remove <UID> - 取消订阅",
  "login - 扫码登录微博",
  "pull - 立即拉取一次微博卡片",
  "check - 检查登录状态",
  "💚",
  "weibo list",
  "weibo add 8376019184",
  "weibo remove 1234567890",
  "weibo login",
  "weibo pull",
].join("\n");

const getGroupId = (session: Session) =>
  (session.channel as unknown as Channel)?.id as string | undefined;

const parseUid = (args: string[] | undefined) => args?.[1]?.trim();

const handleList = async (ctx: WeiboContext, session: Session) => {
  const groupID = getGroupId(session);
  const subscribes = await ctx.database
    .select("weibo_subscribes")
    .where({ groupID, isActive: true })
    .execute();
  if (!subscribes?.length) {
    return session.sendQueued("未找到订阅");
  }
  const msg = ["当前订阅的UID:"];
  for (const subscribe of subscribes) {
    msg.push(
      `- ${subscribe.isActive ? "💚" : "🩶"} ${subscribe.weiboUID} ${subscribe.weiboName} `,
    );
  }
  return session.sendQueued(msg.join("\n"));
};

const handleAdd = async (
  ctx: WeiboContext,
  session: Session,
  weiboUID?: string,
) => {
  if (!weiboUID || !REGEX.IS_WEIBO_UID.test(weiboUID)) {
    return session.sendQueued("请输入正确格式的UID");
  }
  const groupID = getGroupId(session);
  if (!groupID) {
    return session.sendQueued("未找到群ID");
  }

  const beforeSubscribe = await ctx.database
    .select("weibo_subscribes")
    .where({ id: `${weiboUID}-${groupID}` })
    .execute();
  if (beforeSubscribe.some((subscribe) => subscribe.isActive)) {
    return session.sendQueued("已订阅，无需重复订阅");
  }
  if (beforeSubscribe.some((item) => item.isActive != true)) {
    await ctx.database.set(
      "weibo_subscribes",
      { id: `${weiboUID}-${groupID}` },
      { isActive: true },
    );
    return session.sendQueued(`重新订阅成功: ${weiboUID}`);
  }

  await ctx.database.create("weibo_subscribes", {
    id: `${weiboUID}-${groupID}`,
    weiboUID,
    groupID,
    isActive: true,
    createdAt: new Date(),
  });
  return session.sendQueued(`订阅成功: ${weiboUID}`);
};

const handleRemove = async (
  ctx: WeiboContext,
  session: Session,
  weiboUID?: string,
) => {
  if (!weiboUID || !REGEX.IS_WEIBO_UID.test(weiboUID)) {
    return session.sendQueued("请输入正确格式的UID");
  }
  const groupID = getGroupId(session);
  if (!groupID) {
    return session.sendQueued("未找到群ID");
  }

  const beforeSubscribe = await ctx.database
    .select("weibo_subscribes")
    .where({ id: `${weiboUID}-${groupID}`, isActive: true })
    .execute();
  if (beforeSubscribe.length === 0) {
    return session.sendQueued("未找到订阅，无需取消订阅");
  }

  await session.sendQueued(
    `正在取消订阅...\nUID: ${weiboUID} ${beforeSubscribe[0].weiboName}`,
  );
  await ctx.database.set(
    "weibo_subscribes",
    { weiboUID, groupID },
    { isActive: false },
  );
  return session.sendQueued(`移除订阅成功: ${weiboUID}`);
};

const handleCheck = async (ctx: WeiboContext, session: Session) => {
  const loginStatus = await checkLoginStatus(ctx);
  return session.sendQueued(
    loginStatus ? "微博登录状态正常" : "微博登录状态异常",
  );
};

export const registerWeiboCommand = (
  ctx: WeiboContext,
  config: Config,
  pollWeibo: () => Promise<void>,
) => {
  ctx.command("weibo <message>").action(async (argv, message) => {
    const session = argv.session;
    if (!session) return;
    if (!ctx.puppeteer) {
      await session.sendQueued("please install puppeteer plugin");
      return;
    }

    try {
      switch (message) {
        case "help":
          await sendMsg(HELP_TEXT, session);
          return;
        case "list":
          await handleList(ctx, session);
          return;
        case "add":
          await handleAdd(ctx, session, parseUid(argv.args));
          return;
        case "remove":
          await handleRemove(ctx, session, parseUid(argv.args));
          return;
        case "login":
          await getQRcode(ctx, session, config.isDebugMode);
          return;
        case "pull":
        case "立刻获取":
          await pollWeibo();
          return;
        case "check":
          await handleCheck(ctx, session);
          return;
        default:
          return;
      }
    } catch (error) {
      await sendMsg(formatPuppeteerError(error), session);
    }
  });
};
