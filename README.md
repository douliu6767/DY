# 订阅管理面板 (Subscription Management Panel)

一个类似 Xboard 的订阅链接管理面板，用于管理 VMess、VLess 等代理节点信息。

## 功能特性

- ✨ 现代化的用户界面
- 🔐 管理员登录认证
- 📦 支持 VMess 和 VLess 协议
- 🔗 生成订阅链接，兼容 v2rayN、QuantumultX 等客户端
- ⏰ 订阅链接到期时间管理
- 🎯 一个订阅链接管理多个节点

## 快速开始

### 安装依赖

```bash
npm install
```

### 启动服务

```bash
npm start
```

服务将在 `http://localhost:3000` 上运行。

### 默认登录信息

- 用户名: `admin`
- 密码: `admin123`

## 使用说明

### 1. 登录

访问 `http://localhost:3000` 并使用默认账号登录。

### 2. 添加节点

在"节点管理"标签页中：
- 点击"添加节点"按钮
- 填写节点信息（类型、名称、服务器地址、端口、UUID等）
- 点击"保存"

### 3. 创建订阅

在"订阅管理"标签页中：
- 点击"创建订阅"按钮
- 输入订阅名称
- 选择要包含的节点
- 可选设置到期时间
- 点击"保存"

### 4. 使用订阅链接

- 复制订阅链接
- 在 v2rayN、QuantumultX 或其他代理软件中添加订阅
- 软件会自动解析并导入所有节点

## 订阅链接格式

订阅链接格式：`http://localhost:3000/api/subscription/{subscription_id}`

支持的协议：
- **VMess**: 标准 VMess 链接格式，兼容 v2rayN
- **VLess**: 标准 VLess 链接格式

## 技术栈

- **后端**: Node.js + Express
- **前端**: HTML5 + CSS3 + JavaScript
- **认证**: JWT (JSON Web Tokens)
- **数据存储**: JSON 文件

## 配置

### 环境变量

- `PORT`: 服务端口 (默认: 3000)
- `JWT_SECRET`: JWT 密钥 (如未设置，将自动生成随机密钥，但重启后会失效)

### 数据文件

所有数据存储在 `data/` 目录：
- `users.json`: 用户信息
- `nodes.json`: 节点信息
- `subscriptions.json`: 订阅信息

## 安全提示

⚠️ **重要**: 在生产环境中使用时：

1. 修改默认管理员密码
2. 设置固定的 JWT_SECRET 环境变量（否则服务器重启后所有用户需要重新登录）
3. 使用 HTTPS
4. 定期备份 `data/` 目录
5. 限制服务器访问权限
6. 添加速率限制（rate limiting）以防止暴力破解和 DDoS 攻击

## 生产环境建议

对于生产环境部署，建议：
- 使用反向代理（如 Nginx）配置 HTTPS 和速率限制
- 使用进程管理器（如 PM2）保持服务运行
- 配置防火墙规则
- 定期更新依赖包

## API 文档

### 认证接口

- `POST /api/login` - 用户登录

### 节点管理接口

- `GET /api/nodes` - 获取所有节点
- `POST /api/nodes` - 创建节点
- `PUT /api/nodes/:id` - 更新节点
- `DELETE /api/nodes/:id` - 删除节点

### 订阅管理接口

- `GET /api/subscriptions` - 获取所有订阅
- `POST /api/subscriptions` - 创建订阅
- `PUT /api/subscriptions/:id` - 更新订阅
- `DELETE /api/subscriptions/:id` - 删除订阅

### 订阅链接

- `GET /api/subscription/:id` - 获取订阅内容（Base64编码）

## License

MIT