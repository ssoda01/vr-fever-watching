/** koishi-plugin-puppeteer 的 render 返回 h.image().toString()，不是原始 PNG */
export function parsePuppeteerRenderOutput(output: string | Buffer): Buffer {
  if (Buffer.isBuffer(output)) return output;
  const match = output.match(/data:image\/[^;]+;base64,([^"]+)/);
  if (!match) {
    throw new Error("无法从 puppeteer 渲染结果解析图片数据");
  }
  return Buffer.from(match[1], "base64");
}
