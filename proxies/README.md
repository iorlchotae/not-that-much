# 给「没吃多少」搭一个转发（跨域代理）

**什么时候需要这个？** 当你想用一家「浏览器不允许直接调用」的接口时。
典型的是 **OpenCode Go** 和 **豆包 / 火山方舟**。

---

## 为什么网页调不了，别的软件却可以

不是配置界面的差别，是**谁在发这个请求**。

| | 「没吃多少」 | 桌面软件（比如 openhanako） |
| --- | --- | --- |
| 形态 | 静态网页 | Electron / Tauri 桌面程序 |
| 谁发请求 | **浏览器** | Node / Rust 主进程 |
| 有没有跨域限制 | **有** | **没有** |

浏览器的规矩是：**对方必须在响应里明确说「允许这个网站读」**（返回
`Access-Control-Allow-Origin`），否则浏览器拿到响应也**不给你看**。

桌面软件的请求从 Node 或 Rust 发出去，**根本不经过浏览器的这套检查**，所以它填个
Base URL 就能用。

**实测证据**（从真实页面发起）：

| | OpenCode Go | DeepSeek（对照，可用） |
| --- | --- | --- |
| OPTIONS 预检 | **404，无跨域头** | 200 + 跨域头 |
| POST | 401，**无跨域头** | 401 + 跨域头 |
| GET / HEAD | **404，无跨域头** | — |

也就是说：**那台服务器对任何请求都不返回跨域头**。所以
**不管换什么 Key、怎么配置，网页都读不到它的响应。**

绕过浏览器唯一的正规办法，就是**让请求从一个不受跨域限制的地方发出去** ——
也就是下面这个转发。

---

## 方案：Cloudflare Worker（免费，约 2 分钟）

### 部署

1. 打开 <https://dash.cloudflare.com> → **Workers & Pages** → **Create** → **Worker**
2. 起个名字，**Deploy**
3. 点 **Edit code**，把本目录的
   [`cloudflare-worker.js`](cloudflare-worker.js) 整个粘进去，覆盖默认内容
4. 再点 **Deploy**
5. 复制它给你的地址，形如 `https://xxx.yyy.workers.dev`

### 在 App 里填

打开 App 底部的 **⚙️ 配置 AI 服务** → 选 **OpenCode Go** → 展开 **高级设置** →
把「接口地址」改成（**`?url=` 后面那串必须 URL 编码**）：

```
https://xxx.yyy.workers.dev/?url=https%3A%2F%2Fopencode.ai%2Fzen%2Fgo%2Fv1%2Fchat%2Fcompletions
```

豆包就是换成：

```
https://xxx.yyy.workers.dev/?url=https%3A%2F%2Fark.cn-beijing.volces.com%2Fapi%2Fv3%2Fchat%2Fcompletions
```

模型名照旧填在「模型名」里，Key 照旧填在 API Key 里 —— 转发会把它们原样带过去。

> 要加别的服务商，把它的域名加进 `ALLOWED_HOSTS` 再重新 Deploy。
> 那个白名单是必要的：没有它，这个 Worker 就是一个谁都能拿来做坏事的开放代理。

---

## ⚠️ 不要用公共的免费跨域代理

网上有很多「CORS proxy」「在线跨域」之类的服务，看起来一行就能解决。**别用。**

它们会把你的请求原样转发 —— 包括 `Authorization` 头，**也就是你的 API Key**。
那等于把 Key 交给一个陌生人。自己部署的 Worker 跑在你自己的账号上，Key 只经过你自己。

---

## 这个方案的代价，说清楚

- 多了一跳，**每次识别会慢一点**
- 照片会**经过你的 Worker**（但它只是转发，不存）
- Worker 免费额度对个人使用完全够用

如果你不想搭转发，那就**用那 7 家能直接调的**（DeepSeek、Agnes、KIMI、智谱、
通义千问、硅基流动、OpenRouter）—— 它们不需要这一页。
