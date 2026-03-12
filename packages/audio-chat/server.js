import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config({ path: path.join(path.dirname(fileURLToPath(import.meta.url)), '.env') });

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = 3003;

const DAILY_API_KEY = process.env.DAILY_API_KEY || '';
const DAILY_API_URL = 'https://api.daily.co/v1';

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Create a Daily.co room
app.post('/api/room', async (req, res) => {
  if (!DAILY_API_KEY) {
    return res.status(500).json({
      error: 'DAILY_API_KEY not set. Get one at https://dashboard.daily.co/ and add it to packages/audio-chat/.env'
    });
  }
  try {
    const response = await fetch(`${DAILY_API_URL}/rooms`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${DAILY_API_KEY}`
      },
      body: JSON.stringify({
        properties: {
          exp: Math.floor(Date.now() / 1000) + 3600, // 1 hour
          enable_chat: true,
          enable_knocking: false,
          max_participants: 10
        }
      })
    });
    const room = await response.json();
    res.json({ url: room.url, name: room.name });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create a meeting token (optional, for authenticated access)
app.post('/api/token', async (req, res) => {
  if (!DAILY_API_KEY) {
    return res.status(500).json({ error: 'DAILY_API_KEY not set' });
  }
  try {
    const { roomName, userName } = req.body;
    const response = await fetch(`${DAILY_API_URL}/meeting-tokens`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${DAILY_API_KEY}`
      },
      body: JSON.stringify({
        properties: {
          room_name: roomName,
          user_name: userName || 'Player',
          exp: Math.floor(Date.now() / 1000) + 3600
        }
      })
    });
    const token = await response.json();
    res.json(token);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n  🎙️ Audio Chat → http://localhost:${PORT}`);
  if (!DAILY_API_KEY) {
    console.log(`  ⚠️  No DAILY_API_KEY found — create packages/audio-chat/.env`);
    console.log(`     Get a free key at https://dashboard.daily.co/\n`);
  } else {
    console.log(`  ✅ Daily.co API key loaded\n`);
  }
});
