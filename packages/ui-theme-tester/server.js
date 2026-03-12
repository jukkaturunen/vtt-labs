import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = 3001;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Serve theme files
app.get('/api/themes', (req, res) => {
  const themesDir = path.join(__dirname, 'themes');
  const files = fs.readdirSync(themesDir).filter(f => f.endsWith('.css'));
  const themes = files.map(f => ({
    id: f.replace('.css', ''),
    name: f.replace('.css', '').replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
    file: `/themes/${f}`
  }));
  res.json(themes);
});

app.use('/themes', express.static(path.join(__dirname, 'themes')));

app.listen(PORT, () => {
  console.log(`\n  🎨 UI Theme Tester → http://localhost:${PORT}\n`);
});
