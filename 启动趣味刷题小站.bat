@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo 正在启动本地服务器...
start /b node local-server.js

echo 等待服务器就绪（3秒）...
timeout /t 3 /nobreak >nul

echo 正在打开浏览器...
start "" "http://127.0.0.1:8766/%E8%B6%A3%E5%91%B3%E5%88%B7%E9%A2%98%E5%B0%8F%E7%AB%99%E7%AC%AC%E4%B8%80%E7%89%88.html"
echo 浏览器已打开，请勿关闭本窗口。
pause
