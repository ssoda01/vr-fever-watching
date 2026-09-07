import { readdir, stat, unlink } from "node:fs/promises";
import path from "node:path";

/** 按文件修改时间删除超过 maxAgeMs 的普通文件，返回删除数量 */
export async function pruneFilesOlderThan(dir: string, maxAgeMs: number) {
  const names = await readdir(dir).catch(() => []);
  if (!names.length) return 0;
  const now = Date.now();
  const results = await Promise.all(
    names.map(async (name) => {
      const filePath = path.join(dir, name);
      const info = await stat(filePath).catch(() => null);
      if (!info?.isFile() || now - info.mtimeMs < maxAgeMs) return false;
      await unlink(filePath).catch(() => {});
      return true;
    }),
  );
  return results.filter(Boolean).length;
}
