#!/bin/zsh -l
# 双击运行：启动 IYS 本地账号服务，并自动打开注册页。
# 关闭这个终端窗口，或在终端里按 Ctrl+C，就会停止服务。

cd "$(dirname "$0")" || exit 1
URL="http://127.0.0.1:3000/index.html"

if curl -sf -m 2 http://127.0.0.1:3000/api/health >/dev/null 2>&1; then
  echo "账号服务已经在运行，直接打开页面。"
  open "$URL"
  exit 0
fi

echo "正在启动 IYS 账号服务..."
echo "关闭这个终端窗口，或按 Ctrl+C，就会停止服务。"
echo

(sleep 2; open "$URL") &
cd server || exit 1
npm start
