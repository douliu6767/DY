const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const Database = require('better-sqlite3');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || require('crypto').randomBytes(32).toString('hex');

// Constants
const DEFAULT_TRAFFIC_LIMIT_BYTES = 107374182400; // 100GB in bytes

// Data storage paths
const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'database.db');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const NODES_FILE = path.join(DATA_DIR, 'nodes.json');
const SUBSCRIPTIONS_FILE = path.join(DATA_DIR, 'subscriptions.json');

// Middleware
app.use(express.json());
app.use(express.static('public'));

// Simple in-memory rate limiting for login attempts
const loginAttempts = new Map();
const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_DURATION = 15 * 60 * 1000; // 15 minutes

function rateLimitLogin(req, res, next) {
  const ip = req.ip || req.connection.remoteAddress;
  const now = Date.now();
  
  if (loginAttempts.has(ip)) {
    const attempts = loginAttempts.get(ip);
    const recentAttempts = attempts.filter(time => now - time < LOCKOUT_DURATION);
    
    if (recentAttempts.length >= MAX_LOGIN_ATTEMPTS) {
      return res.status(429).json({ error: '登录尝试次数过多，请15分钟后再试' });
    }
    
    loginAttempts.set(ip, recentAttempts);
  }
  
  next();
}

// Initialize data directory and database
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Initialize SQLite database
let db;
function initializeDatabase() {
  db = new Database(DB_FILE);
  
  // Create tables
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      role TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    
    CREATE TABLE IF NOT EXISTS nodes (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      name TEXT NOT NULL,
      server TEXT NOT NULL,
      port INTEGER NOT NULL,
      uuid TEXT NOT NULL,
      alter_id INTEGER DEFAULT 0,
      network TEXT DEFAULT 'tcp',
      tls TEXT DEFAULT 'none',
      host TEXT,
      path TEXT,
      sni TEXT,
      header_type TEXT,
      encryption TEXT,
      raw_link TEXT,
      created_at TEXT NOT NULL
    );
    
    CREATE TABLE IF NOT EXISTS subscriptions (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      expires_at TEXT,
      traffic_limit INTEGER DEFAULT ${DEFAULT_TRAFFIC_LIMIT_BYTES},
      created_at TEXT NOT NULL
    );
    
    CREATE TABLE IF NOT EXISTS subscription_nodes (
      subscription_id TEXT NOT NULL,
      node_id TEXT NOT NULL,
      PRIMARY KEY (subscription_id, node_id),
      FOREIGN KEY (subscription_id) REFERENCES subscriptions(id) ON DELETE CASCADE,
      FOREIGN KEY (node_id) REFERENCES nodes(id) ON DELETE CASCADE
    );
  `);
  
  // Add traffic_limit column if it doesn't exist (for database migration)
  try {
    db.exec(`ALTER TABLE subscriptions ADD COLUMN traffic_limit INTEGER DEFAULT ${DEFAULT_TRAFFIC_LIMIT_BYTES}`);
  } catch (error) {
    // Column already exists or other migration issue - check if it's the expected error
    if (!error.message.includes('duplicate column name')) {
      console.warn('Database migration warning:', error.message);
    }
  }
  
  // Migrate from JSON files if they exist
  migrateFromJSON();
  
  // Initialize default admin user if no users exist
  const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get();
  if (userCount.count === 0) {
    const defaultPassword = bcrypt.hashSync('admin123', 10);
    const now = getBeijingTime();
    db.prepare('INSERT INTO users (id, username, password, role, created_at) VALUES (?, ?, ?, ?, ?)').run(
      uuidv4(), 'admin', defaultPassword, 'admin', now
    );
  }
}

// Helper function to get Beijing time (UTC+8)
function getBeijingTime() {
  const now = new Date();
  const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
  const beijingTime = new Date(utc + (8 * 3600000));
  return beijingTime.toISOString();
}

// Migrate data from JSON files to SQLite
function migrateFromJSON() {
  // Migrate users
  if (fs.existsSync(USERS_FILE)) {
    try {
      const users = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
      const insertUser = db.prepare('INSERT OR IGNORE INTO users (id, username, password, role, created_at) VALUES (?, ?, ?, ?, ?)');
      for (const user of users) {
        insertUser.run(user.id, user.username, user.password, user.role, user.createdAt || getBeijingTime());
      }
      // Rename the old file
      fs.renameSync(USERS_FILE, USERS_FILE + '.migrated');
    } catch (error) {
      console.log('No users to migrate or error:', error.message);
    }
  }
  
  // Migrate nodes
  if (fs.existsSync(NODES_FILE)) {
    try {
      const nodes = JSON.parse(fs.readFileSync(NODES_FILE, 'utf8'));
      const insertNode = db.prepare(`INSERT OR IGNORE INTO nodes 
        (id, type, name, server, port, uuid, alter_id, network, tls, host, path, sni, header_type, encryption, raw_link, created_at) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
      for (const node of nodes) {
        insertNode.run(
          node.id, node.type, node.name, node.server, node.port, node.uuid,
          node.alterId || 0, node.network || 'tcp', node.tls || 'none',
          node.host || null, node.path || null, node.sni || null,
          node.headerType || null, node.encryption || null, node.rawLink || null, node.createdAt || getBeijingTime()
        );
      }
      fs.renameSync(NODES_FILE, NODES_FILE + '.migrated');
    } catch (error) {
      console.log('No nodes to migrate or error:', error.message);
    }
  }
  
  // Migrate subscriptions
  if (fs.existsSync(SUBSCRIPTIONS_FILE)) {
    try {
      const subscriptions = JSON.parse(fs.readFileSync(SUBSCRIPTIONS_FILE, 'utf8'));
      const insertSub = db.prepare('INSERT OR IGNORE INTO subscriptions (id, name, expires_at, created_at) VALUES (?, ?, ?, ?)');
      const insertSubNode = db.prepare('INSERT OR IGNORE INTO subscription_nodes (subscription_id, node_id) VALUES (?, ?)');
      
      for (const sub of subscriptions) {
        insertSub.run(sub.id, sub.name, sub.expiresAt || null, sub.createdAt || getBeijingTime());
        if (sub.nodeIds && Array.isArray(sub.nodeIds)) {
          for (const nodeId of sub.nodeIds) {
            insertSubNode.run(sub.id, nodeId);
          }
        }
      }
      fs.renameSync(SUBSCRIPTIONS_FILE, SUBSCRIPTIONS_FILE + '.migrated');
    } catch (error) {
      console.log('No subscriptions to migrate or error:', error.message);
    }
  }
}

initializeDatabase();

// Auth middleware
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access denied' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid token' });
    }
    req.user = user;
    next();
  });
}

// Auth routes
app.post('/api/login', rateLimitLogin, (req, res) => {
  const { username, password } = req.body;
  
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  
  if (!user) {
    recordLoginAttempt(req);
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  
  const validPassword = bcrypt.compareSync(password, user.password);
  if (!validPassword) {
    recordLoginAttempt(req);
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  
  // Successful login - clear attempts
  const ip = req.ip || req.connection.remoteAddress;
  loginAttempts.delete(ip);
  
  const token = jwt.sign(
    { id: user.id, username: user.username, role: user.role },
    JWT_SECRET,
    { expiresIn: '24h' }
  );
  
  res.json({ token, username: user.username });
});

function recordLoginAttempt(req) {
  const ip = req.ip || req.connection.remoteAddress;
  const now = Date.now();
  
  if (!loginAttempts.has(ip)) {
    loginAttempts.set(ip, []);
  }
  
  const attempts = loginAttempts.get(ip);
  attempts.push(now);
  loginAttempts.set(ip, attempts);
}

// Node management routes
app.get('/api/nodes', authenticateToken, (req, res) => {
  const nodes = db.prepare('SELECT * FROM nodes ORDER BY created_at DESC').all();
  // Convert snake_case to camelCase for frontend compatibility
  const formattedNodes = nodes.map(node => ({
    id: node.id,
    type: node.type,
    name: node.name,
    server: node.server,
    port: node.port,
    uuid: node.uuid,
    alterId: node.alter_id,
    network: node.network,
    tls: node.tls,
    host: node.host,
    path: node.path,
    sni: node.sni,
    headerType: node.header_type,
    encryption: node.encryption,
    rawLink: node.raw_link,
    createdAt: node.created_at
  }));
  res.json(formattedNodes);
});

app.post('/api/nodes', authenticateToken, (req, res) => {
  const newNode = {
    id: uuidv4(),
    type: req.body.type,
    name: req.body.name,
    server: req.body.server,
    port: req.body.port,
    uuid: req.body.uuid,
    alterId: req.body.alterId || 0,
    network: req.body.network || 'tcp',
    tls: req.body.tls || 'none',
    host: req.body.host || null,
    path: req.body.path || null,
    sni: req.body.sni || null,
    headerType: req.body.headerType || null,
    encryption: req.body.encryption || null,
    rawLink: req.body.rawLink || null,
    createdAt: getBeijingTime()
  };
  
  db.prepare(`INSERT INTO nodes 
    (id, type, name, server, port, uuid, alter_id, network, tls, host, path, sni, header_type, encryption, raw_link, created_at) 
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    newNode.id, newNode.type, newNode.name, newNode.server, newNode.port, newNode.uuid,
    newNode.alterId, newNode.network, newNode.tls, newNode.host, newNode.path, newNode.sni,
    newNode.headerType, newNode.encryption, newNode.rawLink, newNode.createdAt
  );
  
  res.status(201).json(newNode);
});

app.put('/api/nodes/:id', authenticateToken, (req, res) => {
  const node = db.prepare('SELECT * FROM nodes WHERE id = ?').get(req.params.id);
  
  if (!node) {
    return res.status(404).json({ error: 'Node not found' });
  }
  
  db.prepare(`UPDATE nodes SET 
    type = ?, name = ?, server = ?, port = ?, uuid = ?, alter_id = ?,
    network = ?, tls = ?, host = ?, path = ?, sni = ?, header_type = ?, encryption = ?
    WHERE id = ?`).run(
    req.body.type || node.type,
    req.body.name || node.name,
    req.body.server || node.server,
    req.body.port || node.port,
    req.body.uuid || node.uuid,
    req.body.alterId !== undefined ? req.body.alterId : node.alter_id,
    req.body.network || node.network,
    req.body.tls || node.tls,
    req.body.host !== undefined ? req.body.host : node.host,
    req.body.path !== undefined ? req.body.path : node.path,
    req.body.sni !== undefined ? req.body.sni : node.sni,
    req.body.headerType !== undefined ? req.body.headerType : node.header_type,
    req.body.encryption !== undefined ? req.body.encryption : node.encryption,
    req.params.id
  );
  
  const updatedNode = db.prepare('SELECT * FROM nodes WHERE id = ?').get(req.params.id);
  res.json({
    id: updatedNode.id,
    type: updatedNode.type,
    name: updatedNode.name,
    server: updatedNode.server,
    port: updatedNode.port,
    uuid: updatedNode.uuid,
    alterId: updatedNode.alter_id,
    network: updatedNode.network,
    tls: updatedNode.tls,
    host: updatedNode.host,
    path: updatedNode.path,
    sni: updatedNode.sni,
    headerType: updatedNode.header_type,
    encryption: updatedNode.encryption,
    createdAt: updatedNode.created_at
  });
});

app.delete('/api/nodes/:id', authenticateToken, (req, res) => {
  const result = db.prepare('DELETE FROM nodes WHERE id = ?').run(req.params.id);
  
  if (result.changes === 0) {
    return res.status(404).json({ error: 'Node not found' });
  }
  
  res.json({ message: 'Node deleted successfully' });
});

// Import node from link
app.post('/api/nodes/import', authenticateToken, (req, res) => {
  const { link } = req.body;
  
  if (!link || typeof link !== 'string') {
    return res.status(400).json({ error: 'Invalid link' });
  }
  
  try {
    let nodeData;
    
    if (link.startsWith('vmess://')) {
      nodeData = parseVmessLink(link);
    } else if (link.startsWith('vless://')) {
      nodeData = parseVlessLink(link);
    } else {
      return res.status(400).json({ error: 'Unsupported protocol. Only vmess:// and vless:// are supported.' });
    }
    
    const newNode = {
      id: uuidv4(),
      ...nodeData,
      rawLink: link,
      createdAt: getBeijingTime()
    };
    
    db.prepare(`INSERT INTO nodes 
      (id, type, name, server, port, uuid, alter_id, network, tls, host, path, sni, header_type, encryption, raw_link, created_at) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      newNode.id, newNode.type, newNode.name, newNode.server, newNode.port, newNode.uuid,
      newNode.alterId || 0, newNode.network || 'tcp', newNode.tls || 'none',
      newNode.host || null, newNode.path || null, newNode.sni || null,
      newNode.headerType || null, newNode.encryption || null, newNode.rawLink, newNode.createdAt
    );
    
    res.status(201).json({
      id: newNode.id,
      type: newNode.type,
      name: newNode.name,
      server: newNode.server,
      port: newNode.port,
      uuid: newNode.uuid,
      alterId: newNode.alterId,
      network: newNode.network,
      tls: newNode.tls,
      host: newNode.host,
      path: newNode.path,
      sni: newNode.sni,
      headerType: newNode.headerType,
      encryption: newNode.encryption,
      rawLink: newNode.rawLink,
      createdAt: newNode.createdAt
    });
  } catch (error) {
    res.status(400).json({ error: 'Failed to parse link: ' + error.message });
  }
});

// Parse vmess:// link
function parseVmessLink(link) {
  const base64Data = link.substring(8); // Remove 'vmess://'
  const jsonData = Buffer.from(base64Data, 'base64').toString('utf8');
  const config = JSON.parse(jsonData);
  
  const port = parseInt(config.port);
  if (isNaN(port) || port < 1 || port > 65535) {
    throw new Error('Invalid port number in vmess link');
  }
  
  return {
    type: 'vmess',
    name: config.ps || 'Imported VMess',
    server: config.add,
    port: port,
    uuid: config.id,
    alterId: parseInt(config.aid) || 0,
    network: config.net || 'tcp',
    tls: config.tls || 'none',
    host: config.host || null,
    path: config.path || null,
    sni: config.sni || null,
    headerType: config.type || null
  };
}

// Parse vless:// link
function parseVlessLink(link) {
  // Format: vless://uuid@server:port?params#name
  const url = new URL(link);
  const uuid = url.username;
  const server = url.hostname;
  const port = parseInt(url.port);
  
  if (isNaN(port) || port < 1 || port > 65535) {
    throw new Error('Invalid port number in vless link');
  }
  
  const name = decodeURIComponent(url.hash.substring(1)) || 'Imported VLess';
  
  const params = new URLSearchParams(url.search);
  
  return {
    type: 'vless',
    name: name,
    server: server,
    port: port,
    uuid: uuid,
    encryption: params.get('encryption') || 'none',
    network: params.get('type') || 'tcp',
    tls: params.get('security') || 'none',
    sni: params.get('sni') || null,
    host: params.get('host') || null,
    path: params.get('path') || null
  };
}

// Subscription management routes
app.get('/api/subscriptions', authenticateToken, (req, res) => {
  const subscriptions = db.prepare('SELECT * FROM subscriptions ORDER BY created_at DESC').all();
  
  const result = subscriptions.map(sub => {
    const nodeIds = db.prepare('SELECT node_id FROM subscription_nodes WHERE subscription_id = ?')
      .all(sub.id)
      .map(row => row.node_id);
    
    return {
      id: sub.id,
      name: sub.name,
      nodeIds: nodeIds,
      expiresAt: sub.expires_at,
      trafficLimit: sub.traffic_limit || DEFAULT_TRAFFIC_LIMIT_BYTES,
      createdAt: sub.created_at
    };
  });
  
  res.json(result);
});

app.post('/api/subscriptions', authenticateToken, (req, res) => {
  const newSubscription = {
    id: uuidv4(),
    name: req.body.name,
    nodeIds: req.body.nodeIds || [],
    expiresAt: req.body.expiresAt || null,
    trafficLimit: req.body.trafficLimit || DEFAULT_TRAFFIC_LIMIT_BYTES,
    createdAt: getBeijingTime()
  };
  
  db.prepare('INSERT INTO subscriptions (id, name, expires_at, traffic_limit, created_at) VALUES (?, ?, ?, ?, ?)').run(
    newSubscription.id, newSubscription.name, newSubscription.expiresAt, newSubscription.trafficLimit, newSubscription.createdAt
  );
  
  const insertSubNode = db.prepare('INSERT INTO subscription_nodes (subscription_id, node_id) VALUES (?, ?)');
  for (const nodeId of newSubscription.nodeIds) {
    insertSubNode.run(newSubscription.id, nodeId);
  }
  
  res.status(201).json(newSubscription);
});

app.put('/api/subscriptions/:id', authenticateToken, (req, res) => {
  const subscription = db.prepare('SELECT * FROM subscriptions WHERE id = ?').get(req.params.id);
  
  if (!subscription) {
    return res.status(404).json({ error: 'Subscription not found' });
  }
  
  db.prepare('UPDATE subscriptions SET name = ?, expires_at = ?, traffic_limit = ? WHERE id = ?').run(
    req.body.name || subscription.name,
    req.body.expiresAt !== undefined ? req.body.expiresAt : subscription.expires_at,
    req.body.trafficLimit !== undefined ? req.body.trafficLimit : (subscription.traffic_limit || DEFAULT_TRAFFIC_LIMIT_BYTES),
    req.params.id
  );
  
  // Update node associations
  if (req.body.nodeIds !== undefined) {
    db.prepare('DELETE FROM subscription_nodes WHERE subscription_id = ?').run(req.params.id);
    const insertSubNode = db.prepare('INSERT INTO subscription_nodes (subscription_id, node_id) VALUES (?, ?)');
    for (const nodeId of req.body.nodeIds) {
      insertSubNode.run(req.params.id, nodeId);
    }
  }
  
  const updatedSub = db.prepare('SELECT * FROM subscriptions WHERE id = ?').get(req.params.id);
  const nodeIds = db.prepare('SELECT node_id FROM subscription_nodes WHERE subscription_id = ?')
    .all(req.params.id)
    .map(row => row.node_id);
  
  res.json({
    id: updatedSub.id,
    name: updatedSub.name,
    nodeIds: nodeIds,
    expiresAt: updatedSub.expires_at,
    trafficLimit: updatedSub.traffic_limit || DEFAULT_TRAFFIC_LIMIT_BYTES,
    createdAt: updatedSub.created_at
  });
});

app.delete('/api/subscriptions/:id', authenticateToken, (req, res) => {
  const result = db.prepare('DELETE FROM subscriptions WHERE id = ?').run(req.params.id);
  
  if (result.changes === 0) {
    return res.status(404).json({ error: 'Subscription not found' });
  }
  
  res.json({ message: 'Subscription deleted successfully' });
});

// System settings routes
app.get('/api/settings/user', authenticateToken, (req, res) => {
  const user = db.prepare('SELECT id, username, role, created_at FROM users WHERE id = ?').get(req.user.id);
  res.json({
    id: user.id,
    username: user.username,
    role: user.role,
    createdAt: user.created_at
  });
});

app.put('/api/settings/password', authenticateToken, (req, res) => {
  const { currentPassword, newPassword } = req.body;
  
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Current password and new password are required' });
  }
  
  if (newPassword.length < 6) {
    return res.status(400).json({ error: 'New password must be at least 6 characters' });
  }
  
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  
  if (!bcrypt.compareSync(currentPassword, user.password)) {
    return res.status(401).json({ error: 'Current password is incorrect' });
  }
  
  const hashedPassword = bcrypt.hashSync(newPassword, 10);
  db.prepare('UPDATE users SET password = ? WHERE id = ?').run(hashedPassword, req.user.id);
  
  res.json({ message: 'Password updated successfully' });
});

app.put('/api/settings/username', authenticateToken, (req, res) => {
  const { newUsername } = req.body;
  
  if (!newUsername || newUsername.length < 3) {
    return res.status(400).json({ error: 'Username must be at least 3 characters' });
  }
  
  // Check if username already exists
  const existingUser = db.prepare('SELECT * FROM users WHERE username = ? AND id != ?').get(newUsername, req.user.id);
  if (existingUser) {
    return res.status(400).json({ error: 'Username already exists' });
  }
  
  db.prepare('UPDATE users SET username = ? WHERE id = ?').run(newUsername, req.user.id);
  
  res.json({ message: 'Username updated successfully', username: newUsername });
});

// Generate subscription link content - Updated endpoint
app.get('/subscription/:id', (req, res) => {
  const subscription = db.prepare('SELECT * FROM subscriptions WHERE id = ?').get(req.params.id);
  
  if (!subscription) {
    return res.status(404).send('Subscription not found');
  }
  
  // Check expiration with Beijing time
  if (subscription.expires_at) {
    const expiresAt = new Date(subscription.expires_at);
    const now = new Date(getBeijingTime());
    if (expiresAt < now) {
      return res.status(410).send('Subscription expired');
    }
  }
  
  const nodeIds = db.prepare('SELECT node_id FROM subscription_nodes WHERE subscription_id = ?')
    .all(req.params.id)
    .map(row => row.node_id);
  
  // Get traffic limit from subscription
  const trafficLimit = subscription.traffic_limit || DEFAULT_TRAFFIC_LIMIT_BYTES;
  const expireTimestamp = subscription.expires_at ? Math.floor(new Date(subscription.expires_at).getTime() / 1000) : 0;
  
  if (nodeIds.length === 0) {
    // Return empty subscription if no nodes
    const content = '';
    const base64Content = Buffer.from(content).toString('base64');
    
    res.set('Content-Type', 'text/plain; charset=utf-8');
    res.set('Subscription-Userinfo', `upload=0; download=0; total=${trafficLimit}; expire=${expireTimestamp}`);
    res.set('Profile-Update-Interval', '24');
    res.send(base64Content);
    return;
  }
  
  const nodes = db.prepare(`SELECT * FROM nodes WHERE id IN (${nodeIds.map(() => '?').join(',')})`).all(...nodeIds);
  
  // Generate base64 encoded links
  const links = nodes.map(node => {
    if (node.type === 'vmess') {
      return generateVmessLink(node);
    } else if (node.type === 'vless') {
      return generateVlessLink(node);
    }
    return null;
  }).filter(link => link !== null);
  
  // Return base64 encoded subscription content
  const content = links.join('\n');
  const base64Content = Buffer.from(content).toString('base64');
  
  res.set('Content-Type', 'text/plain; charset=utf-8');
  res.set('Subscription-Userinfo', `upload=0; download=0; total=${trafficLimit}; expire=${expireTimestamp}`);
  res.set('Profile-Update-Interval', '24');
  res.send(base64Content);
});

// Keep old API endpoint for backward compatibility
app.get('/api/subscription/:id', (req, res) => {
  res.redirect(301, `/subscription/${req.params.id}`);
});

// Generate vmess link
function generateVmessLink(node) {
  const vmessConfig = {
    v: '2',
    ps: node.name,
    add: node.server,
    port: node.port.toString(),
    id: node.uuid,
    aid: (node.alter_id || 0).toString(),
    net: node.network || 'tcp',
    type: node.header_type || 'none',
    host: node.host || '',
    path: node.path || '',
    tls: node.tls || 'none',
    sni: node.sni || ''
  };
  
  const base64Config = Buffer.from(JSON.stringify(vmessConfig)).toString('base64');
  return `vmess://${base64Config}`;
}

// Generate vless link
function generateVlessLink(node) {
  const params = new URLSearchParams();
  if (node.encryption) params.append('encryption', node.encryption);
  if (node.tls && node.tls !== 'none') params.append('security', node.tls);
  if (node.sni) params.append('sni', node.sni);
  if (node.network) params.append('type', node.network);
  if (node.host) params.append('host', node.host);
  if (node.path) params.append('path', node.path);
  
  const paramsStr = params.toString() ? `?${params.toString()}` : '';
  return `vless://${node.uuid}@${node.server}:${node.port}${paramsStr}#${encodeURIComponent(node.name)}`;
}

// Start server
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
  console.log('Using SQLite database for secure data storage');
  console.log('All timestamps use Beijing Time (UTC+8)');
});
