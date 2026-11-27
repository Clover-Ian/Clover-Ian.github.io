# 密钥说明

**不要把 API key 写进任何 HTML / JS 文件。**

当前的 key 只应保存在：

```bash
supabase secrets set RELAY_KEY=sk-...
supabase secrets set RELAY_MODEL=deepseek-v4.1-flash
supabase secrets set RELAY_BASE=https://relaydock.omnis.com.cn/v1
```

然后部署代理：

```bash
supabase functions deploy critter
```

前端调用：

```
https://qbkfdhmjogdwtjovqzaw.supabase.co/functions/v1/critter
```

如果 key 泄露（例如贴到聊天里），立刻去平台后台重置。
