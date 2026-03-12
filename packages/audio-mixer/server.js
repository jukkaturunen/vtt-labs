import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = 3002;

// Ensure uploads dir exists
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir);

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});
const upload = multer({ storage, limits: { fileSize: 50 * 1024 * 1024 } }); // 50MB

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(uploadsDir));

// Upload audio files
app.post('/api/upload', upload.array('files', 20), (req, res) => {
  const files = req.files.map(f => ({
    id: f.filename,
    name: f.originalname,
    url: `/uploads/${f.filename}`,
    size: f.size
  }));
  res.json(files);
});

// List uploaded files
app.get('/api/files', (req, res) => {
  const files = fs.readdirSync(uploadsDir)
    .filter(f => /\.(mp3|wav|ogg|m4a|flac|webm)$/i.test(f))
    .map(f => ({
      id: f,
      name: f.replace(/^\d+-/, ''),
      url: `/uploads/${f}`,
      size: fs.statSync(path.join(uploadsDir, f)).size
    }));
  res.json(files);
});

// Delete a file
app.delete('/api/files/:id', (req, res) => {
  const filepath = path.join(uploadsDir, req.params.id);
  if (fs.existsSync(filepath)) {
    fs.unlinkSync(filepath);
    res.json({ ok: true });
  } else {
    res.status(404).json({ error: 'not found' });
  }
});

app.listen(PORT, () => {
  console.log(`\n  🎵 Audio Mixer → http://localhost:${PORT}\n`);
});
