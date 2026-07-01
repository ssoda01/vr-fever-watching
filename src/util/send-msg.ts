import { h, Session } from "koishi";

const sendImg = (img_buffer: Buffer, session: Session) => {
  return session.sendQueued(h.image(img_buffer, "image/png"));
};
const sendMsg = (msg: string, session: Session) => {
  return session.sendQueued(msg);
};

export { sendImg, sendMsg };
