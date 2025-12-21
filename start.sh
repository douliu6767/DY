#!/bin/bash

# 订阅管理面板一键启动脚本 (Baota Panel Compatible)
# Subscription Management Panel One-Click Start Script

set -e

echo "==================================="
echo "订阅管理面板启动脚本"
echo "Subscription Management Panel"
echo "==================================="

# 检查 Node.js 是否安装
if ! command -v node &> /dev/null; then
    echo "错误: Node.js 未安装"
    echo "请先安装 Node.js (推荐版本: 16.x 或更高)"
    echo ""
    echo "在宝塔面板中安装 Node.js:"
    echo "1. 进入 '软件商店'"
    echo "2. 搜索 'Node.js 版本管理器'"
    echo "3. 安装并选择 Node.js 16.x 或更高版本"
    exit 1
fi

# 显示 Node.js 版本
NODE_VERSION=$(node -v)
echo "Node.js 版本: $NODE_VERSION"

# 检查 npm 是否安装
if ! command -v npm &> /dev/null; then
    echo "错误: npm 未安装"
    exit 1
fi

NPM_VERSION=$(npm -v)
echo "npm 版本: $NPM_VERSION"
echo ""

# 获取脚本所在目录
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "工作目录: $SCRIPT_DIR"
echo ""

# 检查是否已安装依赖
if [ ! -d "node_modules" ]; then
    echo "首次运行，正在安装依赖..."
    npm install
    echo "依赖安装完成！"
    echo ""
else
    echo "依赖已安装，跳过安装步骤"
    echo ""
fi

# 创建数据目录
if [ ! -d "data" ]; then
    echo "创建数据目录..."
    mkdir -p data
fi

# 设置环境变量
export PORT=${PORT:-3000}

# Generate a secure JWT secret if not already set
if [ -z "$JWT_SECRET" ]; then
    if command -v openssl &> /dev/null; then
        export JWT_SECRET=$(openssl rand -hex 32)
    else
        # Fallback to reading from urandom if openssl is not available
        export JWT_SECRET=$(head -c 32 /dev/urandom | xxd -p -c 32)
    fi
fi

echo "配置信息:"
echo "- 端口: $PORT"
echo "- JWT密钥: 已设置"
echo ""

# 检查端口是否被占用
if lsof -Pi :$PORT -sTCP:LISTEN -t >/dev/null 2>&1 ; then
    echo "警告: 端口 $PORT 已被占用"
    echo "请修改 PORT 环境变量或停止占用该端口的进程"
    exit 1
fi

echo "==================================="
echo "正在启动服务..."
echo "==================================="
echo ""
echo "访问地址: http://localhost:$PORT"
echo "默认账号: admin"
echo "默认密码: admin123"
echo ""
echo "⚠️  重要提醒: 首次登录后请立即修改密码！"
echo ""
echo "按 Ctrl+C 停止服务"
echo ""

# 启动服务
node server.js
