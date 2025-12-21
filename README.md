# 订阅管理面板 (Subscription Management Panel)

一个类似 Xboard 的订阅链接管理面板，用于管理 VMess、VLess 等代理节点信息。

## 功能特性

- ✨ 现代化的用户界面
- 🔐 管理员登录认证
- 📦 支持 VMess 和 VLess 协议
- 🔗 生成订阅链接，兼容 v2rayN、QuantumultX 等客户端
- 📥 **支持导入现成的节点链接** (vmess://, vless://)
- ⏰ 订阅链接到期时间管理（使用北京时间）
- 🎯 一个订阅链接管理多个节点
- ⚙️ **系统设置页面** - 修改管理员账号和密码
- 💾 **SQLite 数据库存储** - 更安全可靠的数据存储方案
- 🐳 **Docker 支持** - 一键部署

## 快速开始

### 方式一：使用 Docker Compose (推荐)

```bash
# 克隆仓库
git clone https://github.com/douliu6767/dy.git
cd dy

# 启动服务
docker-compose up -d

# 查看日志
docker-compose logs -f
```

服务将在 `http://localhost:3000` 上运行。

### 方式二：使用 Docker

```bash
# 构建镜像
docker build -t subscription-panel .

# 运行容器
docker run -d \
  -p 3000:3000 \
  -v $(pwd)/data:/app/data \
  -e JWT_SECRET=your-secret-key \
  --name subscription-panel \
  subscription-panel
```

### 方式三：传统方式

#### 安装依赖

```bash
npm install
```

#### 启动服务

```bash
npm start
```

服务将在 `http://localhost:3000` 上运行。

## 初始登录

首次启动后，系统会自动创建默认管理员账号：
- 用户名: `admin`
- 密码: `admin123`

**重要**: 首次登录后，请立即前往"系统设置"页面修改默认密码！

## 使用说明

### 1. 登录

访问 `http://localhost:3000` 并使用管理员账号登录。

### 2. 添加节点

#### 方式一：手动添加
在"节点管理"标签页中：
- 点击"添加节点"按钮
- 填写节点信息（类型、名称、服务器地址、端口、UUID等）
- 点击"保存"

#### 方式二：导入节点链接 (新功能)
在"节点管理"标签页中：
- 点击"📥 导入节点"按钮
- 粘贴 vmess:// 或 vless:// 链接
- 点击"导入"
- 系统会自动解析链接并创建节点

支持的链接格式示例：
```
vmess://eyJhZGQiOiAibWFpbC5kbDY2Lm1lIiwgInBvcnQiOiAiMjAwMDEiLCAiaWQiOiAiMjIzYzk5N2ItOTgyMy00MzRkLWM4YmUtMmViZmFlODIyNTlkIiwgImFpZCI6ICIwIiwgIm5ldCI6ICJ0Y3AiLCAidHlwZSI6ICJub25lIiwgInRscyI6ICJub25lIn0=

vless://223c997b-9823-434d-c8be-2ebfae82259d@mail.dl66.me:20001?type=tcp&security=none#HK
```

### 3. 创建订阅

在"订阅管理"标签页中：
- 点击"创建订阅"按钮
- 输入订阅名称
- 选择要包含的节点
- 可选设置到期时间（使用北京时间）
- 点击"保存"

### 4. 使用订阅链接

- 复制订阅链接 (格式: `http://localhost:3000/subscription/{id}`)
- 在 v2rayN、QuantumultX 或其他代理软件中添加订阅
- 软件会自动解析并导入所有节点

### 5. 系统设置 (新功能)

在"系统设置"标签页中：
- 修改管理员用户名
- 修改登录密码

## 订阅链接格式

订阅链接格式：`http://localhost:3000/subscription/{subscription_id}`

旧格式 `/api/subscription/{id}` 会自动重定向到新格式。

支持的协议：
- **VMess**: 标准 VMess 链接格式，兼容 v2rayN
- **VLess**: 标准 VLess 链接格式

## 技术栈

- **后端**: Node.js + Express
- **前端**: HTML5 + CSS3 + JavaScript
- **认证**: JWT (JSON Web Tokens)
- **数据存储**: SQLite (better-sqlite3)
- **容器化**: Docker & Docker Compose

## 配置

### 环境变量

- `PORT`: 服务端口 (默认: 3000)
- `JWT_SECRET`: JWT 密钥 (强烈建议在生产环境中设置)

### 数据文件

所有数据存储在 `data/` 目录：
- `database.db`: SQLite 数据库文件（包含用户、节点、订阅信息）

### 数据迁移

如果您从旧版本升级，系统会自动将 JSON 文件中的数据迁移到 SQLite 数据库：
- `users.json` → `database.db` (users 表)
- `nodes.json` → `database.db` (nodes 表)
- `subscriptions.json` → `database.db` (subscriptions 表)

迁移后，原 JSON 文件会被重命名为 `.migrated` 后缀。

## 安全提示

⚠️ **重要**: 在生产环境中使用时：

1. **立即修改默认管理员密码** - 首次登录后请前往系统设置页面修改
2. 设置强密码的 JWT_SECRET 环境变量
3. 使用 HTTPS（通过反向代理如 Nginx）
4. 定期备份 `data/database.db` 文件
5. 限制服务器访问权限
6. 启用防火墙规则
7. 定期更新依赖包

## 生产环境建议

对于生产环境部署，建议：
- 使用反向代理（如 Nginx）配置 HTTPS 和速率限制
- 使用 Docker 或进程管理器（如 PM2）保持服务运行
- 配置防火墙规则
- 定期备份数据库文件
- 定期更新依赖包
- 设置强密码的 JWT_SECRET

### Nginx 反向代理配置示例

```nginx
server {
    listen 80;
    server_name your-domain.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name your-domain.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

## API 文档

### 认证接口

- `POST /api/login` - 用户登录

### 节点管理接口

- `GET /api/nodes` - 获取所有节点
- `POST /api/nodes` - 创建节点
- `POST /api/nodes/import` - **导入节点链接** (新增)
- `PUT /api/nodes/:id` - 更新节点
- `DELETE /api/nodes/:id` - 删除节点

### 订阅管理接口

- `GET /api/subscriptions` - 获取所有订阅
- `POST /api/subscriptions` - 创建订阅
- `PUT /api/subscriptions/:id` - 更新订阅
- `DELETE /api/subscriptions/:id` - 删除订阅

### 系统设置接口 (新增)

- `GET /api/settings/user` - 获取当前用户信息
- `PUT /api/settings/username` - 更新用户名
- `PUT /api/settings/password` - 更新密码

### 订阅链接

- `GET /subscription/:id` - 获取订阅内容（Base64编码）
- `GET /api/subscription/:id` - 旧格式，重定向到新格式

## 时区说明

系统所有时间戳均使用**北京时间 (UTC+8)**：
- 节点创建时间
- 订阅创建时间
- 订阅到期时间
- 用户创建时间

## 更新日志

### v2.0.0
- ✅ 移除登录页面默认凭据显示
- ✅ 从 JSON 文件迁移到 SQLite 数据库
- ✅ 新增节点链接导入功能 (vmess://, vless://)
- ✅ 新增系统设置页面（修改用户名和密码）
- ✅ 所有时间使用北京时间 (UTC+8)
- ✅ 订阅链接格式更新为 `/subscription/{id}`
- ✅ 添加 Docker 和 Docker Compose 支持
- ✅ 自动数据迁移功能

## License

MIT