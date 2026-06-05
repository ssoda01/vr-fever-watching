
// const AccountPanelCard = defineComponent({
//   name: 'WeiboAccountPanelCard',
//   props: {
//     embedded: Boolean,
//   },
//   setup(props) {
//     const { state, pending, actionError, runtimeError, startLogin } = useAccountPanelState()

//     return () => {
//       const current = state.value
//       // 修改判定条件：只要状态是 success 且有 Cookie，就认为是登录成功的账号展示界面
//       const isLoginSuccess = current?.status === 'success' && current?.hasCookie
//       const hasProfile = Boolean(current?.profile?.screenName || current?.profile?.avatarUrl || current?.profile?.uid)
//       const showProfileCard = isLoginSuccess || hasProfile

//       // 注意：后端的 status 在成功后会变成 success，pending.value 在前端请求完毕后也会变成 false
//       // 这里确保登录成功后 waitingForQr 为 false
//       const waitingForQr = pending.value || current?.status === 'pending'

//       // 核心修改：明确在什么情况下需要展示底部的二维码容器
//       // 1. 如果没有登录（没有 profile 且没显示成功），那肯定要展示
//       // 2. 如果正在登录流程中（pending/waitingForQr），也要展示
//       const shouldShowQrBox = !showProfileCard || waitingForQr

//       return h('div', {
//         style: props.embedded ? styles.embedCard : styles.card,
//         'data-weibo-notify-account-panel': 'schema',
//       }, [
//         h('div', { style: styles.subtitle }, showProfileCard ? '当前微博账号' : '登录微博'),
//         showProfileCard ? h('div', { style: styles.panelHero, 'style.marginBottom': '16px' }, [
//           h('div', { style: styles.panelProfile }, [
//             current?.profile?.avatarUrl
//               ? h('img', { src: current.profile.avatarUrl, style: styles.panelAvatar })
//               : h('div', { style: styles.panelFallback }, current?.profile?.screenName?.slice(0, 1) || '微'),
//             h('div', { style: styles.panelName }, current?.profile?.screenName || '微博用户'),
//             h('div', { style: styles.panelUid }, `UID：${current?.profile?.uid || '暂无'}`),
//           ]),
//           h('div', { style: styles.panelStatus }, [
//             h('div', { style: styles.panelInfoList }, [
//               h('div', { style: styles.panelInfo }, [
//                 h('span', { style: styles.label }, 'Cookie 状态'),
//                 h('span', null, current?.cookieStatusText || '未加载'),
//               ]),
//               h('div', { style: styles.panelInfo }, [
//                 h('span', { style: styles.label }, 'Cookie 更新时间'),
//                 h('span', null, formatTime(current?.lastCookieRefreshAt)),
//               ]),
//               current?.lastError
//                 ? h('div', { style: `${styles.panelInfo};${styles.error}` }, [
//                   h('span', { style: styles.label }, '错误信息'),
//                   h('span', null, current.lastError),
//                 ])
//                 : null,
//               actionError.value
//                 ? h('div', { style: `${styles.panelInfo};${styles.error}` }, [
//                   h('span', { style: styles.label }, '操作失败'),
//                   h('span', null, actionError.value),
//                 ])
//                 : null,
//               runtimeError.value
//                 ? h('div', { style: `${styles.panelInfo};${styles.error}` }, [
//                   h('span', { style: styles.label }, '运行时错误'),
//                   h('span', null, runtimeError.value),
//                 ])
//                 : null,
//             ]),
//           ]),
//         ]) : null,

//         shouldShowQrBox ? h('div', { style: styles.qrBox }, current?.qrImageDataUrl
//           ? h('img', { src: current.qrImageDataUrl, style: styles.qrImage })
//           : h('div', { style: styles.placeholder }, waitingForQr
//             ? '正在从微博登录页提取二维码，请稍候…'
//             : `当前还没有可用二维码。\n稍后会自动拉取。\n登录页地址：${current?.loginUrl || 'https://passport.weibo.com/'}`)) : null,

//         h('div', { style: styles.buttonRow }, [
//           h('button', {
//             style: pending.value ? `${styles.button} ${styles.buttonDisabled}` : styles.button,
//             disabled: pending.value,
//             onClick: () => startLogin(true),
//           }, pending.value ? '请求中…' : '刷新二维码'),
//         ]),
//       ])
//     }
//   },
// })
