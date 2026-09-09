我就跟你实话实说了

# koishi-plugin-vr-fever

[![npm](https://img.shields.io/npm/v/koishi-plugin-vr-fever?style=flat-square)](https://www.npmjs.com/package/koishi-plugin-vr-fever)

自用改型回旋插件

## weibo相关

期间内同博主多条微博&点赞，并展示评论

使用指南: `@[机器人] weibo help`

- 主贴、转帖（带评论）
- 最近点赞（不全）

## 更新记录

| No. | Item                                     | Status        |
| --- | ---------------------------------------- | ------------- |
| 1   | 没有办法展示微博表情                     | 0.0.6中已修复 |
| 2   | 缺少emoji字体                            | 0.0.7中已修复 |
| 3   | 更新抓取点赞逻辑，增加weibo_like_cursors | 0.0.9中更新   |

## 其他

1. 截图 emoji 依赖 **跑 Chromium 的那个环境** 里的字体。官方 Koishi 镜像是 Alpine，宿主机或 `apt` 装的字体进不了容器。

   已有容器里临时安装（装完必须重启容器，让 Chrome 重新读字体）：

   ```bash
   docker exec -u root -it <koishi容器名> sh -c \
     "apk add --no-cache font-noto-emoji fontconfig && fc-cache -f"
   docker restart <koishi容器名>
   docker exec <koishi容器名> fc-list | grep -i emoji
   ```

   能看到 `Noto Color Emoji` 或 `Noto Emoji` 才算装上。

   自己基于官方镜像构建时：

   ```dockerfile
   FROM koishijs/koishi:latest
   USER root
   RUN apk add --no-cache font-noto-emoji \
     && fc-cache -f
   ```

   非 Docker 的 Linux 宿主机：

   ```bash
   # Debian / Ubuntu
   apt install fonts-noto-color-emoji fonts-noto-cjk

   # Fedora
   dnf install google-noto-emoji-fonts google-noto-sans-cjk-fonts

   # Arch
   pacman -S noto-fonts-emoji noto-fonts-cjk
   ```

2. 微博系列逻辑照搬了以下仓库，并进行魔改。如果你追求更好的使用体验，请使用它们：

- https://github.com/moehuhu/weibo-monitor#readme
- https://github.com/MingxiaGuo/koishi-plugin-weibo-notify#readme

## TODO

1. b站动态
2. b站直播的弹幕流
