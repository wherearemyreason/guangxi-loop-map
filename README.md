# ooolj.fun · 双人回忆站

一个为两个人保存旅行影像与微信朋友圈内容的私密回忆网站。当前工程已经从单一地图 Demo 重构为三个清晰入口：

- `/travel`：地图式旅行路线、按坐标归类的站点相册与视频播放。
- `/moments`：接近微信朋友圈信息结构的时间线、九宫格、点赞、评论和详情。
- `/manage`：新增旅行、站点、照片/视频以及朋友圈内容。

## 本地启动

```bash
npm install
npm run dev
```

没有 Mapbox Token 时会显示可操作的路线示意图；配置后显示真实地图，并在批量导入照片时提供平均定位点周边的景区候选：

```env
VITE_MAPBOX_TOKEN=your_public_mapbox_token
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your_anon_key
```

生产检查：

```bash
npm run lint
npm run build
```

## 当前数据模式

正式模式需要配置 `VITE_SUPABASE_URL` 和 `VITE_SUPABASE_ANON_KEY`。配置后页面要求 Supabase Auth 登录，旅行和朋友圈从 Postgres 读取，新增媒体通过 Edge Functions 直传 Cloudflare R2 私有桶，再用短时签名 URL 展示。未配置云端环境变量时只显示配置提示，不会悄悄回退到不安全的本地私密模式。

`supabase/migrations/202608180001_initial_memory_archive.sql` 是数据库基础模型。`media-init`、`media-complete`、`media-access` 负责 R2 上传校验和访问签名；部署这些函数前必须在 Supabase secrets 中配置 R2 和 `SUPABASE_SERVICE_ROLE_KEY`。不要继续使用旧 `AdminPanel.tsx` 对 `trips` 表的扁平写入方式，它与新 schema 不兼容。

## ooolj.fun 部署

1. 在 Supabase 执行 migration，创建两个 Auth 用户并分别赋予 `owner`、`contributor`。
2. 在 Cloudflare R2 创建私有 bucket 和最小权限 API token。
3. 配置 Supabase Edge Function secrets，并部署 `media-init`、`media-complete`、`media-access`、`content-delete`、`content-restore`。
4. 配置 Vercel 环境变量；Mapbox Token 只允许 `ooolj.fun` 和 `www.ooolj.fun` 来源。
5. 将当前 `public/photos` 的公开静态资源迁入 R2，并创建对应的 `media`、`stop_media` 记录。
6. 在 Vercel 绑定 `ooolj.fun` 和 `www.ooolj.fun`，部署后逐页验证 `/travel`、`/moments`、`/manage`。
7. 完成首次数据库导出、媒体校验和异地备份后，才把站点视为正式私密归档。

更完整的权限、媒体、费用和备份设计见项目根目录的 `详细工程实现方案.md` 与 `项目工程参考.md`。

## 隐私提醒

不要把真实媒体继续放进 `public/`。Vercel 静态文件天然可公开访问；正式媒体必须迁移到 R2 私有桶，并由 `media-access` 返回短时签名 URL。保存双方影像及朋友圈内第三方昵称、头像、评论前，也建议确认对方同意的保存范围。
