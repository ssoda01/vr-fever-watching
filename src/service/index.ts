// import { Context, Schema } from "koishi";
// import { parseWeiboDateString } from "../util/timeline-normalizer";

// export function to<T, U = Error>(
//   promise: Promise<T>,
//   errorExt?: object,
// ): Promise<[U, undefined] | [null, T]> {
//   return promise
//     .then<[null, T]>((data: T) => [null, data])
//     .catch<[U, undefined]>((err: U) => {
//       if (errorExt) {
//         const parsedError = Object.assign({}, err, errorExt);
//         return [parsedError, undefined];
//       }
//       return [err, undefined];
//     });
// }

// export const getWeiboAndSendMessageToGroup = async (
//   ctx: Context,
//   params: any,
// ) => {
//   const [err, res] = await to(getWeibo(params));
//   if (err) {
//     ctx.logger.error(err);
//     return;
//   }
//   const data = res.data || {};
//   const weiboList = data.list || [];
//   const latestWeibo = weiboList[0] || {};
//   let message = getMessage(params, latestWeibo);
//   if (!message) {
//     return;
//   }
//   if (params.sendAll) {
//     message = '<at id="all"/> ' + message;
//   }
//   ctx.bots[`${params.plantform}:${params.account}`].sendMessage(
//     params.groupID,
//     message,
//   );
// };

// const getMessage = (params: any, latestWeibo: any): string => {
//   if (!latestWeibo) {
//     return "";
//   }
//   const { created_at, user } = latestWeibo;
//   const time = parseWeiboDateString(created_at);
//   if (!time) {
//     return "";
//   }
//   const lastCheckTime =
//     Date.now() -
//     (params.waitMinutes > 0 ? params.waitMinutes * 60 * 1000 : 60000);
//   if (time.getTime() < lastCheckTime) {
//     return "";
//   }
//   const screenName = user?.screen_name || "";
//   let weiboType = -1;
//   //获取微博类型0-视频，2-图文,1-转发微博
//   if ("page_info" in latestWeibo) {
//     weiboType = 0;
//   }
//   if ("pic_infos" in latestWeibo) {
//     weiboType = 2;
//   }
//   if ("topic_struct" in latestWeibo || "retweeted_status" in latestWeibo) {
//     weiboType = 1;
//   }
//   let message = "";
//   if (weiboType == 0) {
//     const pageInfo = latestWeibo?.page_info;
//     if (!pageInfo) {
//       return message;
//     }
//     const objType = pageInfo?.object_type || "";
//     if (objType == "video") {
//       const text = latestWeibo?.text_raw || "";
//       const video = pageInfo?.media_info?.h5_url || "";
//       message += screenName + " 发布了微博:\n" + text + "\n" + video || "";
//     }
//   }
//   if (weiboType == 1) {
//     message += screenName + " 转发了微博:\n" + latestWeibo?.text_raw || "";
//   }
//   if (weiboType == 2) {
//     const text = latestWeibo?.text_raw || "";
//     const picIds = latestWeibo?.pic_ids || [];
//     const picInfos = latestWeibo?.pic_infos || {};
//     const firstPicUrl = picInfos?.[picIds[0]]?.large?.url || "";
//     const picture = `<img src="${firstPicUrl}"/>`;
//     message += screenName + " 发布了微博:\n" + text + "\n" + picture || "";
//   }
//   const mid = latestWeibo?.mid || "";
//   const url = `\n链接：https://m.weibo.cn/status/${mid}`;
//   return message
//     ? message + url
//     : screenName + " 发布了微博:\n" + latestWeibo?.text_raw + url || "";
// };


// // const getWeibo = async (config: any, callback?: any): Promise<any> => {
// //   const { weiboUID } = config;
// //   if (!weiboUID) {
// //     return;
// //   }
// //   const headers = {
// //     accept:
// //       "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
// //     "accept-language": "zh-CN,zh;q=0.9,en;q=0.8,en-GB;q=0.7,en-US;q=0.6",
// //     "cache-control": "no-cache",
// //     cookie:
// //       "XSRF-TOKEN=mgVY3WMp8U-T6Wbu24ifdazm; SUBP=0033WrSXqPxfM72-Ws9jqgMF55529P9D9WhizH8r9Hyn870HzJo4TQoB; SUB=_2AkMSf_1df8NxqwJRmfATxWrlaIV_ywjEieKkIwyGJRMxHRl-yj8XqksbtRB6Of_Tsj1wFglssEkNvyqikP19B0UlIrd8; WBPSESS=NcA3pTjBP9SOtpsXaAXWlx_1aL3IfVadLkk5h-hKiZrhJi_NyNc2r5RbB0ZE0gYuG6ZSJmF8k26JJ46ltyme0fAcMSF9VPonnDU1TPvBjVADJPPa99vi0TVPQDCUKIMU",
// //     referer: "https://passport.weibo.com/",
// //     "user-agent":
// //       "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/117.0.0.0 Safari/537.36",
// //     "x-xsrf-token": "mgVY3WMp8U-T6Wbu24ifdazm",
// //   };
// //   const options = {
// //     hostname: "weibo.com",
// //     path: "/ajax/statuses/mymblog?uid=" + weiboUID,
// //     method: "GET",
// //     headers: headers,
// //   };
// //   return new Promise((resolve, reject) => {
// //     https.get(options, (res) => {
// //       let body = "";
// //       res.on("data", (chunk) => {
// //         body += chunk;
// //       });
// //       res.on("end", () => {
// //         try {
// //           const returnData = JSON.parse(body);
// //           callback?.(returnData);
// //           resolve(returnData);
// //         } catch (error) {
// //           reject({ error, body });
// //         }
// //       });
// //       res.on("error", (error) => {
// //         reject({ error, body });
// //       });
// //     });
// //   });
// // };
