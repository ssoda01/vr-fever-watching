import { h, Session } from "koishi";

const sendImg = (img_buffer: Buffer, session: Session) => {
  return session.sendQueued(
    h("img", {
      src: `data:image/png;base64,${img_buffer.toString("base64")}`,
    }),
  );
};
const sendMsg = (msg: string, session: Session) => {
  return session.sendQueued(msg);
};

export { sendImg, sendMsg };
