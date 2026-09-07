import { mkdir, readdir, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { Context, h, Session } from "koishi";

const SEND_CACHE_DIR = path.join(process.cwd(), "data", "weibo-send-cache");
const SEND_CACHE_MAX_AGE_MS = 6 * 60 * 60 * 1000;

const detectImageExt = (buffer: Buffer) => {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8) {
    return "jpg";
  }
  return "png";
};

const formatSendImageError = (error: unknown, sizeKB: string) => {
  const code = (error as { code?: number })?.code;
  const message = error instanceof Error ? error.message : String(error);
  const brief = message.includes("base64://")
    ? "send_group_msg failed"
    : message.slice(0, 200);
  return `发送图片失败${code != null ? ` retcode=${code}` : ""} (${sizeKB} KB): ${brief}`;
};

async function pruneSendCache() {
  const files = await readdir(SEND_CACHE_DIR).catch(() => []);
  const now = Date.now();
  await Promise.all(
    files.map(async (name) => {
      const filePath = path.join(SEND_CACHE_DIR, name);
      const info = await stat(filePath).catch(() => null);
      if (!info || now - info.mtimeMs < SEND_CACHE_MAX_AGE_MS) return;
      await unlink(filePath).catch(() => {});
    }),
  );
}

/** 写成本地文件再发 file://，避免 OneBot 把整段 base64 塞进 send_group_msg */
const sendImg = async (img_buffer: Buffer, session: Session) => {
  await mkdir(SEND_CACHE_DIR, { recursive: true });
  await pruneSendCache();
  const ext = detectImageExt(img_buffer);
  const filePath = path.join(
    SEND_CACHE_DIR,
    `${Date.now()}-${process.hrtime.bigint().toString()}.${ext}`,
  );
  await writeFile(filePath, img_buffer);
  const sizeKB = (img_buffer.length / 1024).toFixed(1);
  try {
    return await session.sendQueued(h.image(pathToFileURL(filePath).href));
  } catch (error) {
    throw new Error(formatSendImageError(error, sizeKB));
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
