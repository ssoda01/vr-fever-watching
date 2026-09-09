import { Context, Schema } from "koishi";
import {} from "@koishijs/plugin-server";
import { registerWeiboCommand } from "./commands/weibo";
import { extendModels } from "./model";
import { createLoginStatusWatch } from "./service/login";
import { createPollWeibo } from "./service/poll";
import { ensurePuppeteerBrowser } from "./util/puppeteer";
import { pruneScreenshotDebug } from "./util/save-screenshot";
import { createGroupSender, registerWeiboImageRoute } from "./util/send-msg";
import { getWaitMs } from "./util/timer";

export const name = "vr-fever";
export type { WeiboCookie, WeiboLikeCursor, WeiboSubscribe } from "./model";

export const using = ["puppeteer", "database", "http", "server"];

export const inject = {
  required: [...using],
  optional: ["console"],
};

export interface Config {
  adminAccount: string;
  adminGroupID: string;
  waitMinutes: number;
  isTextMode: boolean;
  isDebugMode: boolean;
  imageBaseUrl: string;
}

export const Config: Schema<Config> = Schema.object({
  adminAccount: Schema.string().description("账号(qq号)"),
  adminGroupID: Schema.string().description("管理员群ID，用于微博是否掉登录"),
  waitMinutes: Schema.number()
    .default(3)
    .min(3)
    .description("隔多久拉取一次最新微博 (分钟)，最少3分钟"),
  isTextMode: Schema.boolean()
    .default(false)
    .description("开启后以文本推送微博，关闭则以截图图片推送"),
  isDebugMode: Schema.boolean()
    .default(false)
    .description("开启后保存调试截图（登录二维码、微博推送截图等）"),
  imageBaseUrl: Schema.string()
    .role("link")
    .default("http://host.docker.internal:5140")
    .description(
      "NapCat 拉取图片用的 Koishi 地址。协议端在 Docker 时填 http://host.docker.internal:端口",
    ),
});

export async function apply(ctx: Context, config: Config) {
  extendModels(ctx);
  registerWeiboImageRoute(ctx);

  const sendToGroup = createGroupSender(ctx, config.adminAccount);
  const pollWeibo = createPollWeibo(ctx, config, sendToGroup);
  const watchLogin = createLoginStatusWatch(
    ctx,
    config.adminGroupID,
    sendToGroup,
  );

  ctx.setInterval(watchLogin, getWaitMs(30));
  ctx.setInterval(pollWeibo, getWaitMs(config.waitMinutes));
  ctx.setInterval(async () => {
    const deleted = await pruneScreenshotDebug();
    if (deleted) {
      ctx.logger.info(`已清理 ${deleted} 张超过 7 天的调试截图`);
    }
  }, getWaitMs(24 * 60));

  const deleted = await pruneScreenshotDebug();
  if (deleted) {
    ctx.logger.info(`已清理 ${deleted} 张超过 7 天的调试截图`);
  }

  await ensurePuppeteerBrowser(ctx);
  registerWeiboCommand(ctx, config, pollWeibo);
}
