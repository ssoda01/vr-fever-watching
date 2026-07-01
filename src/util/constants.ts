const WEIBO_PASSPORT_URL = "https://passport.weibo.com/";
const WEB_TIMEOUT = 120000;
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const WEIBO_SAMPLE_UID = "1777106132";
// const WEIBO_SAMPLE_UID = "6187647068";
// const WEIBO_SAMPLE_UID = "7198559139";
// const WEIBO_SAMPLE_UID = "8376019184";
// 最近x分钟内的消息
// const TIME_SCOPE_MINUTES = 30 + 24 * 60;
/** 图片请求间隔（毫秒），避免并发被微博 CDN 限流 */
const IMAGE_FETCH_DELAY_MS = 500;
const MAX_POST_IMAGES = 30;
const MAX_TIMELINE_IMAGES = 30;
/** 每条微博卡片最多渲染的一级评论数 */
const MAX_RENDER_COMMENTS = 5;
/** 每条一级评论最多渲染的楼中楼数 */
const MAX_RENDER_COMMENT_REPLIES = 3;
const IMAGE_LOAD_TIMEOUT_MS = 5000;
/** 微博截图 HTML 卡片宽度（px） */
const RENDER_CARD_WIDTH = 320;

export const CONSTANTS = {
  WEIBO_PASSPORT_URL,
  WEB_TIMEOUT,
  USER_AGENT,
  WEIBO_SAMPLE_UID,
  // TIME_SCOPE_MINUTES,
  IMAGE_FETCH_DELAY_MS,
  MAX_POST_IMAGES,
  MAX_TIMELINE_IMAGES,
  MAX_RENDER_COMMENTS,
  MAX_RENDER_COMMENT_REPLIES,
  IMAGE_LOAD_TIMEOUT_MS,
  RENDER_CARD_WIDTH,
};
const IS_WEIBO_UID = /^[0-9]{1,10}$/;
const IS_QRPIC = "^https?:\/\/[^/]*qr[^/]*\.(com|cn)";
export const REGEX = {
  IS_QRPIC,
  IS_WEIBO_UID,
};
