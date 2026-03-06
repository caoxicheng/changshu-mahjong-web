# changshu-mahjong-web

移动端优先的常熟麻将 Web 平台。首版支持游客身份、房间号加入、4 人基础对局、断线重连和基础结算。

## 目录

- `apps/web`: 前端大厅、房间、对局页面
- `apps/server`: 实时房间与牌局服务
- `packages/shared`: 前后端共享协议、领域类型和基础规则

## 本地开发

```bash
pnpm install
pnpm dev:server
pnpm dev:web
```

默认前端地址为 `http://localhost:5173`，服务端地址为 `http://localhost:3001`，WebSocket 地址为 `ws://localhost:3001/ws`。
