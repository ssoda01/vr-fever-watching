import { h, Session } from "koishi";

const sendImg = (img_buffer: Buffer, session: Session) => {
  return session.send(
    h("img", {
      src: `data:image/png;base64,${img_buffer.toString("base64")}`,
    }),
  );
};
const sendMsg = (msg: string, session: Session) => {
  return session.send(msg);
};

export { sendImg, sendMsg };
