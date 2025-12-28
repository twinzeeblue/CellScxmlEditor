#!/bin/bash

# Cell SCXML Editor - Extension 打包腳本
# 此腳本會編譯專案並產生 .vsix 安裝檔案

set -e

# 切換到專案根目錄
cd "$(dirname "$0")/.."

echo "🚀 開始準備打包 Cell SCXML Editor..."

# 1. 檢查 vsce 是否安裝
if ! command -v vsce &> /dev/null && ! command -v npx vsce &> /dev/null; then
    echo "❌ 錯誤: 找不到 'vsce' 工具。請安裝它 (npm install -g @vscode/vsce) 或確保可以使用 npx。"
    exit 1
fi

# 2. 安裝相依套件
echo "📦 正在安裝相依套件..."
npm install

# 3. 編譯 TypeScript
echo "🏗️ 正在編譯 TypeScript..."
npm run compile

# 4. 打包 Extension
echo "📦 正在打包 Extension..."
if command -v vsce &> /dev/null; then
    vsce package
else
    npx @vscode/vsce package
fi

echo "✅ 打包完成！您可以在專案根目錄找到產出的 .vsix 檔案。"
