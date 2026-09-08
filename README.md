我就跟你实话实说了

# koishi-plugin-vr-fever

[![npm](https://img.shields.io/npm/v/koishi-plugin-vr-fever?style=flat-square)](https://www.npmjs.com/package/koishi-plugin-vr-fever)

自用改型回旋插件

## weibo相关

期间内同博主多条微博&点赞（按发布时间预估点赞），并展示评论

使用指南: `@[机器人] weibo help`

- 主贴、转帖（带评论）
- 最近点赞（不全）

## 更新记录

| No. | Item                 | Status        |
| --- | -------------------- | ------------- |
| 1   | 没有办法展示微博表情 | 0.0.6中已修复 |
| 2   | 缺少emoji字体        | 0.0.7中已修复 |

## 其他

1. Linux安装Emoji字体文件

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
