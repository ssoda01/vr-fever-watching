import fs from "node:fs/promises";
import path from "node:path";

const SCREENSHOT_DEBUG_DIR = path.join(
  process.cwd(),
  "data",
  "weibo-screenshots",
);

export interface ScreenshotSaveMeta {
  uid?: string;
  name?: string;
  chunkIndex: number;
  totalChunks: number;
  postCount: number;
}

export interface SavedScreenshot {
  filePath: string;
  sizeBytes: number;
  sizeKB: string;
}

export async function saveScreenshotDebug(
  buffer: Buffer,
  meta: ScreenshotSaveMeta,
): Promise<SavedScreenshot> {
  await fs.mkdir(SCREENSHOT_DEBUG_DIR, { recursive: true });
  const safeName = (meta.name || meta.uid || "unknown").replace(
    /[^\w\u4e00-\u9fff-]/g,
    "_",
  );
  const filename = `${safeName}-${Date.now()}-part${meta.chunkIndex + 1}of${meta.totalChunks}-posts${meta.postCount}.png`;
  const filePath = path.join(SCREENSHOT_DEBUG_DIR, filename);
  await fs.writeFile(filePath, buffer);
  const sizeBytes = buffer.length;
  return {
    filePath,
    sizeBytes,
    sizeKB: (sizeBytes / 1024).toFixed(1),
  };
}

export function getScreenshotDebugDir() {
  return SCREENSHOT_DEBUG_DIR;
}
