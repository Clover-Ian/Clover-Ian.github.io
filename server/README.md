# IYS 账号后端（注册 / 登录 / 会话）

给现有的静态网站（`index.html`、`IYS Software.html` 等）提供账号能力。
不包含注册/登录页面——页面由你之后自己写，这里只提供 API 和会话管理。

技术栈：**Node.js + Express 5 + SQLite（Node 内置 `node:sqlite`）+ scrypt**。
只有一个运行时依赖 `express`，不需要额外安装数据库，也不需要编译原生模块。

---

## 1. 快速开始

要求 Node.js **22.13 或更高**（推荐 24；22.13 起内置 `node:sqlite` 不再需要实验开关）。先确认：

```bash
node -v
```

启动：

```bash
cd server
npm install
cp .env.example .env      # 可选，不建也能跑
npm run dev               # 改代码自动重启
# 或者 npm start
```

看到下面的输出就成功了：

```
IYS auth server listening on http://127.0.0.1:3000
SQLite database: .../server/data/iys.db
Static site: .../IYS
```

打开 <http://127.0.0.1:3000> 就是你现在的网站；
API 在 `http://127.0.0.1:3000/api/...`，和页面同源，Cookie 会自动带上，前端不用处理跨域。

数据库文件 `server/data/iys.db` 第一次启动时自动创建，表结构自动迁移。

> 如果 `npm install` 报 `~/.npm` 权限错误，用项目内的缓存目录：
> `npm_config_cache="$PWD/.npm-cache" npm install`

## 2. 目录结构

```
server/
├── src/
│   ├── index.js          启动入口：监听端口、优雅退出
│   ├── app.js            Express 组装：安全头、CORS、CSRF、静态托管、错误处理
│   ├── config.js         环境变量 → 配置对象
│   ├── db.js             SQLite 连接 + 版本化迁移
│   ├── auth/
│   │   ├── routes.js     接口定义
│   │   ├── service.js    用户 / 会话的数据库操作
│   │   ├── passwords.js  scrypt 哈希、常量时间校验
│   │   └── middleware.js 识别当前用户、requireAuth
│   └── lib/
│       ├── errors.js     统一 HttpError
│       ├── cookies.js    Cookie 请求头解析
│       ├── rate-limit.js 内存限流器
│       └── validate.js   邮箱 / 密码 / 昵称校验
├── test/                 集成测试（真实 HTTP 请求）
├── data/                 SQLite 数据库（自动创建，已 gitignore）
├── .env.example          所有可配置项
└── package.json
```

## 3. 接口一览

所有接口前缀 `/api`。除了 `health`，请求和响应都是 JSON；
写操作必须带 `Content-Type: application/json`。

| 方法 | 路径 | 需要登录 | 说明 |
| --- | --- | --- | --- |
| GET | `/api/health` | 否 | 健康检查 |
| POST | `/api/auth/register` | 否 | 注册，成功后自动登录 |
| POST | `/api/auth/login` | 否 | 登录 |
| GET | `/api/auth/me` | 是 | 当前登录用户 |
| POST | `/api/auth/logout` | 否 | 注销当前会话 |
| POST | `/api/auth/logout-all` | 是 | 注销该账号全部设备 |
| POST | `/api/auth/change-password` | 是 | 修改密码（会踢掉其它设备） |
| POST | `/api/auth/change-username` | 是 | 修改显示用户名 |
| POST | `/api/auth/change-email` | 是 | 修改邮箱（需要当前密码） |
| POST | `/api/auth/delete-account` | 是 | 删除账户及其全部会话（需要当前密码和确认） |

用户对象（任何接口都不会返回密码哈希）：

```json
{
  "id": "62bbfe29-eceb-418f-912f-a3ac9e65284f",
  "email": "ian@example.com",
  "displayName": "Ian",
  "emailVerified": false,
  "createdAt": "2026-10-31T09:06:55.009Z"
}
```

出错时统一返回：

```json
{ "error": { "code": "invalid_credentials", "message": "Incorrect email or password." } }
```

`code` 是稳定的，前端按它判断；`message` 是给用户看的英文兜底文案。

### 3.1 注册

```http
POST /api/auth/register
Content-Type: application/json

{ "email": "ian@example.com", "password": "至少 8 位", "displayName": "Ian" }
```

- `displayName` 可选，最长 50 字符。
- 成功返回 `201`，响应头带 `Set-Cookie: iys_session=...; HttpOnly; SameSite=Lax`。
- 邮箱重复返回 `409 email_taken`。

### 3.2 登录

```http
POST /api/auth/login
Content-Type: application/json

{ "email": "ian@example.com", "password": "...", "rememberMe": true }
```

- `rememberMe` 可选（默认 `false`）。为 `true` 时会话有效期 30 天且 Cookie 带 `Max-Age`；
  否则是 12 小时的浏览器会话。
- 成功 `200`，返回 `{ "user": {...}, "expiresAt": "..." }`。
- 邮箱不存在和密码错误都返回 `401 invalid_credentials`，文案完全相同（防账号枚举）。

### 3.3 当前用户

```http
GET /api/auth/me
```

已登录返回 `200 { "user": {...} }`，未登录返回 `401 not_authenticated`。
页面加载时调用它来判断“显示登录按钮还是用户名”。

### 3.4 注销

```http
POST /api/auth/logout
```

即使没登录也返回 `204`，并清掉 Cookie。

### 3.5 修改密码

```http
POST /api/auth/change-password
Content-Type: application/json

{ "currentPassword": "旧密码", "newPassword": "新密码至少 8 位" }
```

成功 `204`。当前设备保持登录，该账号在其它设备/浏览器上的会话全部失效。
旧密码不对返回 `400 invalid_current_password`。

### 3.6 修改用户名

```http
POST /api/auth/change-username
Content-Type: application/json

{ "displayName": "New username" }
```

成功返回 `200 { "user": {...} }`。用户名会去除首尾空格、合并连续空格，最长 50 字符。

### 3.7 删除账户

```http
POST /api/auth/delete-account
Content-Type: application/json

{ "currentPassword": "当前密码", "confirmation": true }
```

成功返回 `204`、清除当前会话 Cookie，并删除账户及其所有设备的会话。需要提供正确的当前密码和显式确认。

### 3.8 用 curl 试一遍

```bash
cd server
npm start   # 另开一个终端

# 注册（-c 保存 Cookie 到文件）
curl -i -c /tmp/cookies.txt -H 'Content-Type: application/json' \
  -d '{"email":"ian@example.com","password":"correct horse battery"}' \
  http://127.0.0.1:3000/api/auth/register

# 当前用户（-b 带上 Cookie）
curl -b /tmp/cookies.txt http://127.0.0.1:3000/api/auth/me

# 注销
curl -i -b /tmp/cookies.txt -X POST http://127.0.0.1:3000/api/auth/logout

# 登录并勾选“记住我”
curl -i -c /tmp/cookies.txt -H 'Content-Type: application/json' \
  -d '{"email":"ian@example.com","password":"correct horse battery","rememberMe":true}' \
  http://127.0.0.1:3000/api/auth/login
```

### 3.7 错误码

| HTTP | code | 含义 |
| --- | --- | --- |
| 400 | `invalid_email` | 邮箱格式不对 |
| 400 | `invalid_password` | 密码为空、少于 8 位或超过 128 位 |
| 400 | `invalid_display_name` | 昵称超过 50 字符 |
| 400 | `invalid_body` | 请求体不是 JSON 对象（例如表单提交） |
| 400 | `invalid_json` | JSON 语法错误 |
| 400 | `invalid_current_password` | 修改密码时旧密码不对 |
| 401 | `not_authenticated` | 没登录 / 会话过期 |
| 401 | `invalid_credentials` | 登录邮箱或密码错误 |
| 403 | `origin_not_allowed` | 跨站写请求被 CSRF 防护拦截 |
| 409 | `email_taken` | 邮箱已注册（大小写不敏感） |
| 413 | `payload_too_large` | 请求体超过 10 KB |
| 429 | `too_many_requests` | 触发限流，响应头有 `Retry-After`（秒） |
| 500 | `internal_error` | 服务端异常，详情只写在服务端日志 |

## 4. 前端怎么接（等你写登录/注册页时用）

登录成功后浏览器会自动保存 HttpOnly Cookie，**前端不需要也不应该把 token 存进 localStorage**。
只需要保证请求带上 Cookie。

`index.html` 同源，直接这样写：

```js
async function api(path, { method = 'GET', body } = {}) {
  const response = await fetch(path, {
    method,
    credentials: 'same-origin',   // 前后端同源；跨域部署改成 'include'
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });

  if (response.status === 204) return null;
  const data = await response.json().catch(() => null);

  if (!response.ok) {
    const error = new Error(data?.error?.message ?? `HTTP ${response.status}`);
    error.code = data?.error?.code;
    error.status = response.status;
    throw error;
  }
  return data;
}

// 注册
await api('/api/auth/register', { method: 'POST', body: { email, password } });

// 登录（勾选“记住我”时传 rememberMe: true）
await api('/api/auth/login', { method: 'POST', body: { email, password } });

// 页面加载时判断登录状态
try {
  const { user } = await api('/api/auth/me');
  console.log('已登录：', user.email);
} catch (error) {
  if (error.status === 401) console.log('未登录');
}

// 注销
await api('/api/auth/logout', { method: 'POST' });
```

登录页把 `401` 显示成“邮箱或密码错误”，把 `429` 显示成“尝试太频繁，请稍后再试”，
注册页把 `409` 显示成“该邮箱已注册”。

### 前后端分开部署（不同域名）

比如页面在 GitHub Pages / Netlify，API 在 Render：

1. 服务端 `.env` 里配置 `ALLOWED_ORIGINS=https://你的前端域名`；
2. 前端 `credentials: 'include'`；
3. 两个站点不同“站”（site）时，必须 HTTPS + `COOKIE_SECURE=true` + `COOKIE_SAMESITE=none`；
   只是端口不同（`localhost:5173` → `localhost:3000`）属于同站，用默认 `lax` 即可。

如果前端环境完全无法用 Cookie，可设 `EXPOSE_TOKEN_IN_BODY=true`，
登录/注册响应会多一个 `token` 字段，之后用 `Authorization: Bearer <token>` 调用接口。
这条路径需要你自己保管 token（XSS 风险更高），一般网页不需要。

## 5. 安全设计

| 项目 | 做法 |
| --- | --- |
| 密码存储 | `scrypt`（N=32768, r=8, p=1，每个密码独立随机盐），只存哈希 |
| 密码校验 | `crypto.timingSafeEqual` 常量时间比较 |
| 会话 | 32 字节随机 token，数据库只存 SHA-256；HttpOnly + SameSite=Lax Cookie |
| CSRF | 写操作校验 `Origin` 必须同源或白名单；只接受 `application/json`；SameSite=Lax |
| 账号枚举 | 登录失败统一文案；邮箱不存在时也执行一次 scrypt，响应时间接近 |
| 暴力破解 | 注册 20 次/小时/IP；登录 60 次/15 分钟/IP；单邮箱失败 10 次/15 分钟 |
| SQL 注入 | 全部使用参数化查询 |
| 源码泄露 | 静态托管显式屏蔽 `/server`、`/node_modules`、`/.git`（有测试覆盖） |
| 响应头 | `nosniff`、`Referrer-Policy`、`X-Frame-Options`、API `no-store`，生产环境加 HSTS |
| 请求体 | 限制 10 KB |

会话过期时间：默认 12 小时（不勾“记住我”）或 30 天（勾选），每小时自动清理过期记录。

## 6. 配置

所有变量见 [`.env.example`](./.env.example)，常用的：

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `HOST` | `127.0.0.1` | 部署到服务器时改 `0.0.0.0` |
| `PORT` | `3000` | 监听端口 |
| `DATABASE_PATH` | `server/data/iys.db` | SQLite 文件位置 |
| `SERVE_STATIC` | `true` | 是否顺便托管项目根目录的页面 |
| `PUBLIC_DIR` | 项目根目录 | 静态文件目录 |
| `ALLOWED_ORIGINS` | 空 | 跨域前端白名单，逗号分隔 |
| `COOKIE_SECURE` | 生产环境 `true` | HTTPS 下必须为 `true` |
| `COOKIE_SAMESITE` | `lax` | 跨站部署用 `none`（需配合 Secure） |
| `SESSION_TTL_HOURS` | `12` | 普通会话时长 |
| `REMEMBER_TTL_DAYS` | `30` | “记住我”时长 |
| `TRUST_PROXY` | `false` | 反向代理后面设为 `1`，否则限流拿不到真实 IP |
| `EXPOSE_TOKEN_IN_BODY` | `false` | 是否在响应里额外返回 token |

## 7. 部署

1. 服务器装 Node.js ≥ 22.13（推荐 24）；
2. `cd server && npm install --omit=dev`；
3. 设置环境变量：`NODE_ENV=production`、`HOST=0.0.0.0`、`COOKIE_SECURE=true`、`TRUST_PROXY=1`；
4. 用 `npm start`、systemd 或 pm2 常驻；
5. 前面放 Nginx / Caddy 做 HTTPS。

Nginx 片段：

```nginx
server {
    listen 443 ssl;
    server_name example.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

注意：

- **纯静态托管（GitHub Pages、Vercel 静态站点等）跑不了这个后端**，需要 Render / Railway / Fly.io / 自己的服务器；
  这类平台的磁盘通常是临时的，SQLite 文件要挂持久卷，否则重启后账号会丢。
- SQLite 适合单实例。以后要多台服务器，需要把数据库换成 PostgreSQL，限流换成 Redis。
- 备份：`sqlite3 server/data/iys.db ".backup 'backup.db'"`（比直接复制文件安全，WAL 模式下也不会漏数据）。

## 8. 测试

```bash
cd server
npm test
```

测试通过真实 HTTP 请求覆盖了注册、重复邮箱、参数校验、登录、注销、改密码、
跨站拦截、限流、过期会话、静态文件隔离等 14 个场景。

## 9. 还没做的功能

这些需要邮件服务或额外设计，当前版本刻意留空：

- **邮箱验证**：`emailVerified` 目前恒为 `false`，注册不会发邮件。接入 SMTP 后可加验证 token。
- **忘记密码 / 重置密码**：需要发邮件，依赖上面的邮件服务。
- **修改邮箱、删除账号**。
- **第三方登录**（Google / Apple）。
- **登录记录 / 审计日志**（`sessions` 表已经存了 IP 和 User-Agent，可以基于它做）。

## 10. 常见问题

**端口被占用**：`PORT=3001 npm start`。

**注册后 Cookie 没保存**：HTTP 环境下 `COOKIE_SECURE` 必须为 `false`（生产环境用 HTTPS 再打开）。

**一直返回 429**：限流计数在内存里，重启服务会清零；默认阈值见第 5 节。

**改了 HTML 需要重启吗**：不需要，静态文件是实时读取的。

**数据库结构怎么改**：在 `src/db.js` 的 `MIGRATIONS` 数组**末尾追加**一段 SQL，重启即自动升级；
不要修改已经发布的旧迁移。
