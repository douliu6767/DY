const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || require('crypto').randomBytes(32).toString('hex');

// Data storage paths
const DATA_DIR = path.join(__dirname, 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const NODES_FILE = path.join(DATA_DIR, 'nodes.json');
const SUBSCRIPTIONS_FILE = path.join(DATA_DIR, 'subscriptions.json');

// Middleware
app.use(express.json());
app.use(express.static('public'));

// Initialize data directory and files
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Initialize default admin user (username: admin, password: admin123)
function initializeUsers() {
  if (!fs.existsSync(USERS_FILE)) {
    const defaultPassword = bcrypt.hashSync('admin123', 10);
    const users = [{
      id: uuidv4(),
      username: 'admin',
      password: defaultPassword,
      role: 'admin'
    }];
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
  }
}

function initializeData() {
  if (!fs.existsSync(NODES_FILE)) {
    fs.writeFileSync(NODES_FILE, JSON.stringify([], null, 2));
  }
  if (!fs.existsSync(SUBSCRIPTIONS_FILE)) {
    fs.writeFileSync(SUBSCRIPTIONS_FILE, JSON.stringify([], null, 2));
  }
}

initializeUsers();
initializeData();

// Helper functions
function readJSON(filepath) {
  try {
    return JSON.parse(fs.readFileSync(filepath, 'utf8'));
  } catch (error) {
    return [];
  }
}

function writeJSON(filepath, data) {
  fs.writeFileSync(filepath, JSON.stringify(data, null, 2));
}

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
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  
  const users = readJSON(USERS_FILE);
  const user = users.find(u => u.username === username);
  
  if (!user) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  
  const validPassword = bcrypt.compareSync(password, user.password);
  if (!validPassword) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  
  const token = jwt.sign(
    { id: user.id, username: user.username, role: user.role },
    JWT_SECRET,
    { expiresIn: '24h' }
  );
  
  res.json({ token, username: user.username });
});

// Node management routes
app.get('/api/nodes', authenticateToken, (req, res) => {
  const nodes = readJSON(NODES_FILE);
  res.json(nodes);
});

app.post('/api/nodes', authenticateToken, (req, res) => {
  const nodes = readJSON(NODES_FILE);
  const newNode = {
    id: uuidv4(),
    ...req.body,
    createdAt: new Date().toISOString()
  };
  nodes.push(newNode);
  writeJSON(NODES_FILE, nodes);
  res.status(201).json(newNode);
});

app.put('/api/nodes/:id', authenticateToken, (req, res) => {
  const nodes = readJSON(NODES_FILE);
  const index = nodes.findIndex(n => n.id === req.params.id);
  
  if (index === -1) {
    return res.status(404).json({ error: 'Node not found' });
  }
  
  nodes[index] = { ...nodes[index], ...req.body, id: req.params.id };
  writeJSON(NODES_FILE, nodes);
  res.json(nodes[index]);
});

app.delete('/api/nodes/:id', authenticateToken, (req, res) => {
  let nodes = readJSON(NODES_FILE);
  const initialLength = nodes.length;
  nodes = nodes.filter(n => n.id !== req.params.id);
  
  if (nodes.length === initialLength) {
    return res.status(404).json({ error: 'Node not found' });
  }
  
  writeJSON(NODES_FILE, nodes);
  res.json({ message: 'Node deleted successfully' });
});

// Subscription management routes
app.get('/api/subscriptions', authenticateToken, (req, res) => {
  const subscriptions = readJSON(SUBSCRIPTIONS_FILE);
  res.json(subscriptions);
});

app.post('/api/subscriptions', authenticateToken, (req, res) => {
  const subscriptions = readJSON(SUBSCRIPTIONS_FILE);
  const newSubscription = {
    id: uuidv4(),
    name: req.body.name,
    nodeIds: req.body.nodeIds || [],
    expiresAt: req.body.expiresAt || null,
    createdAt: new Date().toISOString()
  };
  subscriptions.push(newSubscription);
  writeJSON(SUBSCRIPTIONS_FILE, subscriptions);
  res.status(201).json(newSubscription);
});

app.put('/api/subscriptions/:id', authenticateToken, (req, res) => {
  const subscriptions = readJSON(SUBSCRIPTIONS_FILE);
  const index = subscriptions.findIndex(s => s.id === req.params.id);
  
  if (index === -1) {
    return res.status(404).json({ error: 'Subscription not found' });
  }
  
  subscriptions[index] = { ...subscriptions[index], ...req.body, id: req.params.id };
  writeJSON(SUBSCRIPTIONS_FILE, subscriptions);
  res.json(subscriptions[index]);
});

app.delete('/api/subscriptions/:id', authenticateToken, (req, res) => {
  let subscriptions = readJSON(SUBSCRIPTIONS_FILE);
  const initialLength = subscriptions.length;
  subscriptions = subscriptions.filter(s => s.id !== req.params.id);
  
  if (subscriptions.length === initialLength) {
    return res.status(404).json({ error: 'Subscription not found' });
  }
  
  writeJSON(SUBSCRIPTIONS_FILE, subscriptions);
  res.json({ message: 'Subscription deleted successfully' });
});

// Generate subscription link content
app.get('/api/subscription/:id', (req, res) => {
  const subscriptions = readJSON(SUBSCRIPTIONS_FILE);
  const subscription = subscriptions.find(s => s.id === req.params.id);
  
  if (!subscription) {
    return res.status(404).send('Subscription not found');
  }
  
  // Check expiration
  if (subscription.expiresAt && new Date(subscription.expiresAt) < new Date()) {
    return res.status(410).send('Subscription expired');
  }
  
  const nodes = readJSON(NODES_FILE);
  const subscriptionNodes = nodes.filter(n => subscription.nodeIds.includes(n.id));
  
  // Generate base64 encoded links
  const links = subscriptionNodes.map(node => {
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
  res.set('Subscription-Userinfo', `upload=0; download=0; total=10737418240; expire=${subscription.expiresAt ? Math.floor(new Date(subscription.expiresAt).getTime() / 1000) : 0}`);
  res.send(base64Content);
});

// Generate vmess link
function generateVmessLink(node) {
  const vmessConfig = {
    v: '2',
    ps: node.name,
    add: node.server,
    port: node.port,
    id: node.uuid,
    aid: node.alterId || '0',
    net: node.network || 'tcp',
    type: node.headerType || 'none',
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
  console.log('Default credentials: username: admin, password: admin123');
});
