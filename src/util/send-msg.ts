import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { Context, h, Session } from "koishi";
import {} from "@koishijs/plugin-server";
import { pruneFilesOlderThan } from "./file-prune";

const SEND_CACHE_DIR = path.join(process.cwd(), "data", "weibo-send-cache");
const SEND_CACHE_MAX_AGE_MS = 6 * 60 * 60 * 1000;
const IMAGE_ROUTE = "/weibo-images";
const DEFAULT_IMAGE_BASE_URL = "http://host.docker.internal:5140";

const detectImageExt = (buffer: Buffer) => {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8) {
    return "jpg";
  }
  return "png";
};

const mimeOf = (ext: string) => (ext === "png" ? "image/png" : "image/jpeg");

const trimSlash = (url: string) => url.replace(/\/+$/, "");

const resolveImageBaseUrl = (override?: string) => {
  if (override?.trim()) return trimSlash(override.trim());
  return DEFAULT_IMAGE_BASE_URL;
};

const isSendFail = (error: unknown) => {
  const code = (error as { code?: number })?.code;
  const message = error instanceof Error ? error.message : String(error);
  return code === 1200 || message.includes("retcode=1200");
};

const formatSendImageError = (
  error: unknown,
  sizeKB: string,
  target: string,
) => {
  const code = (error as { code?: number })?.code;
  return `发送图片失败${code != null ? ` retcode=${code}` : ""} (${sizeKB} KB) ${target}`;
};

async function writeSendCache(img_buffer: Buffer) {
  await mkdir(SEND_CACHE_DIR, { recursive: true });
  await pruneFilesOlderThan(SEND_CACHE_DIR, SEND_CACHE_MAX_AGE_MS);
  const ext = detectImageExt(img_buffer);
  const fileName = `weibo-${Date.now()}.${ext}`;
  const filePath = path.join(SEND_CACHE_DIR, fileName);
  await writeFile(filePath, img_buffer);
  return { fileName, filePath, ext };
};

/** Docker 里的 NapCat 读不了宿主机路径，改走 Koishi HTTP */
export function registerWeiboImageRoute(ctx: Context) {
  ctx.server.get(`${IMAGE_ROUTE}/:name`, async (scope) => {
    const name = path.basename(String(scope.params.name || ""));
    if (!/^weibo-\d+\.(jpg|jpeg|png)$/i.test(name)) {
      scope.status = 404;
      return;
    }
    const filePath = path.join(SEND_CACHE_DIR, name);
    const info = await stat(filePath).catch(() => null);
    if (!info?.isFile()) {
      scope.status = 404;
      return;
    }
    const body = await readFile(filePath);
    scope.type = mimeOf(path.extname(name).slice(1).toLowerCase());
    scope.length = body.length;
    return (scope.body = body);
  });
}

/**
 * 发给 NapCat 的必须是它能访问的 HTTP 地址。
 * 协议端在 Docker 时，宿主机路径 /Users/... 会 ENOENT → retcode 1200。
 */
const sendImg = async (
  ctx: Context,
  img_buffer: Buffer,
  session: Session,
  imageBaseUrl?: string,
) => {
  const { fileName, ext } = await writeSendCache(img_buffer);
  const sizeKB = (img_buffer.length / 1024).toFixed(1);
  const url = `${resolveImageBaseUrl(imageBaseUrl)}${IMAGE_ROUTE}/${fileName}`;
  try {
    return await session.sendQueued(h.image(url));
  } catch (error) {
    if (!isSendFail(error)) {
      throw new Error(formatSendImageError(error, sizeKB, url));
    }
    ctx.logger.warn(`HTTP 发图失败，改用内嵌图片 ${fileName}`);
    try {
      return await session.sendQueued(h.image(img_buffer, mimeOf(ext)));
    } catch (fallbackError) {
      throw new Error(formatSendImageError(fallbackError, sizeKB, url));
    }
  }
};

const sendMsg = (msg: string, session: Session) => {
  return session.sendQueued(msg);
};

/** 构造发到指定群的 Session，供定时任务推送 */
export const createGroupSender = (ctx: Context, adminAccount: string) => {
  return (groupId: string): Session => {
    const account = adminAccount.trim();
    const bot = ctx.bots[`onebot:${account}`];
    return {
      sendQueued: (content: unknown) => {
        if (!bot) {
          ctx.logger.warn(
            `未找到机器人实例: onebot:${account}，当前可用: ${Object.keys(ctx.bots).join(", ") || "无"}`,
          );
          return Promise.resolve([]);
        }
        return bot.sendMessage(groupId, content as any);
      },
    } as Session;
  };
};

export { sendImg, sendMsg };
