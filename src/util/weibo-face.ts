import fs from "node:fs/promises";
import path from "node:path";
import { escapeHtml } from "./html";
import WeiboFaceByValues from "./weibo-faces.json";

/** 表情码与图片来自 https://github.com/itorr/weibo-face */
const createWeiboFaceRegex = () => /\[([\u4e00-\u9fa5a-z0-9_]+?)\]/gi;

const FACE_CACHE_DIR = path.join(process.cwd(), "data", "weibo-faces");
const FACE_EXTS = [".png", ".gif", ".jpg", ".jpeg", ".webp"] as const;

const MIME_BY_EXT: Record<string, string> = {
  ".png": "image/png",
  ".gif": "image/gif",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
};

const localFaceMemory = new Map<string, string>();

export type WeiboFaceRef = {
  value: string;
  url: string;
};

export const getWeiboFaceUrl = (value: string): string | undefined =>
  (WeiboFaceByValues as Record<string, string>)[value];

export const collectWeiboFaces = (text: string): WeiboFaceRef[] => {
  if (!text) return [];
  const faces = new Map<string, WeiboFaceRef>();
  for (const match of text.matchAll(createWeiboFaceRegex())) {
    const value = match[1];
    const url = getWeiboFaceUrl(value);
    if (url && !faces.has(value)) {
      faces.set(value, { value, url });
    }
  }
  return [...faces.values()];
};

const sanitizeFaceName = (value: string) =>
  value.replace(/[^\w\u4e00-\u9fff-]/g, "_") || "face";

const extFromMime = (mimeType: string) => {
  const mime = mimeType.split(";")[0].trim().toLowerCase();
  if (mime === "image/gif") return ".gif";
  if (mime === "image/webp") return ".webp";
  if (mime === "image/jpeg" || mime === "image/jpg") return ".jpg";
  return ".png";
};

const cacheFileStem = (value: string, url: string) => {
  let urlStem = "face";
  try {
    urlStem = path.basename(new URL(url).pathname).replace(/\.[^.]+$/, "") || urlStem;
  } catch {
    // ignore invalid url
  }
  return `${sanitizeFaceName(value)}__${sanitizeFaceName(urlStem)}`;
};

const dataUrlFromBuffer = (buffer: Buffer, mimeType: string) =>
  `data:${mimeType};base64,${buffer.toString("base64")}`;

/** 从本地缓存读取表情 data URL，没有则返回 null */
export const loadCachedFace = async (
  value: string,
  url: string,
): Promise<string | null> => {
  const memoryKey = `${value}\n${url}`;
  if (localFaceMemory.has(memoryKey)) return localFaceMemory.get(memoryKey)!;

  const stem = cacheFileStem(value, url);
  for (const ext of FACE_EXTS) {
    try {
      const buffer = await fs.readFile(path.join(FACE_CACHE_DIR, `${stem}${ext}`));
      if (!buffer.length) continue;
      const dataUrl = dataUrlFromBuffer(buffer, MIME_BY_EXT[ext] || "image/png");
      localFaceMemory.set(memoryKey, dataUrl);
      return dataUrl;
    } catch {
      continue;
    }
  }
  return null;
};

/** 把下载到的表情写入本地，并返回 data URL */
export const saveCachedFace = async (
  value: string,
  url: string,
  buffer: Buffer,
  mimeType: string,
): Promise<string> => {
  const mime = mimeType.split(";")[0].trim() || "image/png";
  const dataUrl = dataUrlFromBuffer(buffer, mime);
  localFaceMemory.set(`${value}\n${url}`, dataUrl);

  await fs.mkdir(FACE_CACHE_DIR, { recursive: true });
  const filePath = path.join(
    FACE_CACHE_DIR,
    `${cacheFileStem(value, url)}${extFromMime(mime)}`,
  );
  await fs.writeFile(filePath, buffer).catch(() => {});
  return dataUrl;
};

const UNICODE_EMOJI_RE =
  /(?:\p{Regional_Indicator}{2})|(?:\p{Extended_Pictographic}(?:\uFE0F|\uFE0E)?(?:\u20E3)?(?:\u200D\p{Extended_Pictographic}(?:\uFE0F|\uFE0E)?(?:\u20E3)?)*)/gu;

const wrapUnicodeEmoji = (html: string) =>
  html.replace(
    UNICODE_EMOJI_RE,
    (emoji) => `<span class="emoji">${emoji}</span>`,
  );

/** 转义正文后把 [太开心] 替换为 <img class="weibo-face">，Unicode emoji 包进 .emoji */
export const formatWeiboTextHtml = (
  text: string,
  srcByUrl: Record<string, string> = {},
): string => {
  const escaped = escapeHtml(text || "").replace(/\n/g, "<br/>");
  const withFaces = escaped.replace(createWeiboFaceRegex(), (all, value: string) => {
    const url = getWeiboFaceUrl(value);
    if (!url) return all;
    const src = srcByUrl[url] || url;
    const safeValue = escapeHtml(value);
    return `<img class="weibo-face" data-value="${safeValue}" alt="[${safeValue}]" src="${escapeHtml(src)}" />`;
  });
  return wrapUnicodeEmoji(withFaces);
};
