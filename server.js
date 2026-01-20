const path = require('path');
const express = require('express');
const bodyParser = require('body-parser');
const { MongoClient } = require('mongodb');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017';
const MONGODB_DB = process.env.MONGODB_DB || 'solomons_order';
const COLLECTION = 'state';

const DEFAULT_REALMS = {
  'Great Hall': { color: 'yellow', icon: '🏰', hsl: '60' },
  'War Room': { color: 'orange', icon: '⚔️', hsl: '30' },
  'Thy Strategy': { color: 'pink', icon: '📜', hsl: '330' }
};

app.use(bodyParser.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname)));

let client;

async function getCollection() {
  if (!client) {
    client = new MongoClient(MONGODB_URI, { useUnifiedTopology: true });
    await client.connect();
  }
  const db = client.db(MONGODB_DB);
  return db.collection(COLLECTION);
}

app.get('/api/state', async (req, res) => {
  try {
    const col = await getCollection();
    const doc = await col.findOne({ _id: 'state' });
    if (!doc) {
      return res.json({ tasks: [], realms: DEFAULT_REALMS, counter: 1 });
    }
    const { _id, ...rest } = doc;
    res.json(rest);
  } catch (err) {
    console.error('GET /api/state failed', err);
    res.status(500).json({ error: 'Failed to load state' });
  }
});

app.post('/api/state', async (req, res) => {
  try {
    const incoming = req.body && req.body.state;
    if (!incoming || typeof incoming !== 'object') {
      return res.status(400).json({ error: 'Missing state payload' });
    }
    const col = await getCollection();
    await col.updateOne({ _id: 'state' }, { $set: incoming }, { upsert: true });
    res.json({ ok: true });
  } catch (err) {
    console.error('POST /api/state failed', err);
    res.status(500).json({ error: 'Failed to save state' });
  }
});

app.listen(PORT, () => {
  console.log(`Solomon's Order server running at http://localhost:${PORT}`);
});
