import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, join, resolve, relative, basename } from 'path';
import { readdir, writeFile, readFile, mkdir, rename, rm, stat } from 'fs/promises';
import { existsSync } from 'fs';
import multer from 'multer';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const app = express();
const PORT = 3008;

const SERIES_DIR = join(__dirname, 'series');
if (!existsSync(SERIES_DIR)) await mkdir(SERIES_DIR, { recursive: true });

app.use(express.json({ limit: '20mb' }));
app.use('/series-files', express.static(SERIES_DIR));
app.use(express.static(join(__dirname, 'public')));

const TEXT_EXTS = new Set(['.md', '.markdown', '.txt']);

const SYSTEMS = [
  { id: 'agnostic', label: 'System Agnostic' },
  { id: 'dnd5e-2014', label: 'D&D 5e (2014)' },
  { id: 'dnd5e-2024', label: 'D&D 5e (2024)' },
  { id: 'motw', label: 'Monster of the Week' }
];
const SYSTEM_IDS = new Set(SYSTEMS.map(s => s.id));

function slugify(name) {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60) || 'series';
}

function sanitizeName(name) {
  // For folders/files inside a series. Keep readable but block path separators.
  return String(name).replace(/[\/\\]/g, '').replace(/\.\./g, '').trim();
}

function seriesRoot(slug) {
  const safeSlug = sanitizeName(slug);
  const root = resolve(SERIES_DIR, safeSlug);
  if (!root.startsWith(resolve(SERIES_DIR) + '/') && root !== resolve(SERIES_DIR)) {
    throw new Error('Invalid series');
  }
  return root;
}

function safeJoin(root, relPath) {
  const resolved = resolve(root, relPath || '.');
  const rootResolved = resolve(root);
  if (resolved !== rootResolved && !resolved.startsWith(rootResolved + '/')) {
    throw new Error('Invalid path');
  }
  return resolved;
}

async function readMeta(root) {
  try {
    const raw = await readFile(join(root, '.series.json'), 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function writeMeta(root, meta) {
  await writeFile(join(root, '.series.json'), JSON.stringify(meta, null, 2));
}

async function uniqueSlug(base) {
  let slug = base;
  let n = 2;
  while (existsSync(join(SERIES_DIR, slug))) {
    slug = `${base}-${n++}`;
  }
  return slug;
}

// ─── Series ──────────────────────────────────────────────────────────────────

app.get('/api/systems', (req, res) => {
  res.json(SYSTEMS);
});

app.get('/api/series', async (req, res) => {
  try {
    const entries = await readdir(SERIES_DIR, { withFileTypes: true });
    const list = [];
    for (const e of entries) {
      if (!e.isDirectory()) continue;
      const root = join(SERIES_DIR, e.name);
      const meta = await readMeta(root);
      list.push({
        slug: e.name,
        name: meta?.name || e.name,
        system: meta?.system || 'agnostic',
        created: meta?.created || null,
        lastOpened: meta?.lastOpened || null
      });
    }
    list.sort((a, b) => (b.lastOpened || '').localeCompare(a.lastOpened || ''));
    res.json(list);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/series', async (req, res) => {
  try {
    const name = String(req.body?.name || '').trim();
    if (!name) return res.status(400).json({ error: 'Name required' });
    const system = String(req.body?.system || 'agnostic');
    if (!SYSTEM_IDS.has(system)) return res.status(400).json({ error: 'Invalid system' });
    const slug = await uniqueSlug(slugify(name));
    const root = join(SERIES_DIR, slug);
    await mkdir(root, { recursive: true });
    await mkdir(join(root, 'background'), { recursive: true });
    await mkdir(join(root, 'episode-1'), { recursive: true });
    const now = new Date().toISOString();
    await writeMeta(root, { name, system, created: now, lastOpened: now });
    res.json({ slug, name, system });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.patch('/api/series/:slug', async (req, res) => {
  try {
    const root = seriesRoot(req.params.slug);
    if (!existsSync(root)) return res.status(404).json({ error: 'Not found' });
    const meta = (await readMeta(root)) || {};
    if (req.body?.name) meta.name = String(req.body.name);
    if (req.body?.touch) meta.lastOpened = new Date().toISOString();
    await writeMeta(root, meta);
    res.json({ ok: true, meta });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.delete('/api/series/:slug', async (req, res) => {
  try {
    const root = seriesRoot(req.params.slug);
    if (!existsSync(root)) return res.status(404).json({ error: 'Not found' });
    await rm(root, { recursive: true, force: true });
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ─── Tree ────────────────────────────────────────────────────────────────────

async function buildTree(absPath, root) {
  const entries = await readdir(absPath, { withFileTypes: true });
  const nodes = [];
  for (const e of entries) {
    if (e.name === '.series.json') continue;
    if (e.name.startsWith('.')) continue;
    const full = join(absPath, e.name);
    const rel = relative(root, full);
    if (e.isDirectory()) {
      nodes.push({
        type: 'folder',
        name: e.name,
        path: rel,
        children: await buildTree(full, root)
      });
    } else {
      const ext = (e.name.match(/\.[^.]+$/) || [''])[0].toLowerCase();
      nodes.push({
        type: 'file',
        name: e.name,
        path: rel,
        ext,
        text: TEXT_EXTS.has(ext)
      });
    }
  }
  nodes.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  return nodes;
}

app.get('/api/series/:slug/tree', async (req, res) => {
  try {
    const root = seriesRoot(req.params.slug);
    if (!existsSync(root)) return res.status(404).json({ error: 'Not found' });
    const tree = await buildTree(root, root);
    const meta = await readMeta(root);
    res.json({
      slug: req.params.slug,
      name: meta?.name || req.params.slug,
      system: meta?.system || 'agnostic',
      tree
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ─── Files ───────────────────────────────────────────────────────────────────

app.get('/api/series/:slug/file', async (req, res) => {
  try {
    const root = seriesRoot(req.params.slug);
    const target = safeJoin(root, req.query.path || '');
    const st = await stat(target);
    if (st.isDirectory()) return res.status(400).json({ error: 'Is a directory' });
    const ext = (target.match(/\.[^.]+$/) || [''])[0].toLowerCase();
    if (TEXT_EXTS.has(ext)) {
      const content = await readFile(target, 'utf8');
      res.json({ type: 'text', ext, content });
    } else {
      res.json({
        type: 'binary',
        ext,
        url: `/series-files/${req.params.slug}/${req.query.path}`
      });
    }
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.put('/api/series/:slug/file', async (req, res) => {
  try {
    const root = seriesRoot(req.params.slug);
    const target = safeJoin(root, req.query.path || '');
    const ext = (target.match(/\.[^.]+$/) || [''])[0].toLowerCase();
    if (!TEXT_EXTS.has(ext)) return res.status(400).json({ error: 'Not a text file' });
    await writeFile(target, String(req.body?.content ?? ''), 'utf8');
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/series/:slug/folder', async (req, res) => {
  try {
    const root = seriesRoot(req.params.slug);
    const parent = safeJoin(root, req.body?.path || '');
    const name = sanitizeName(req.body?.name || '');
    if (!name) return res.status(400).json({ error: 'Name required' });
    const target = safeJoin(root, join(req.body?.path || '', name));
    if (existsSync(target)) return res.status(409).json({ error: 'Already exists' });
    await mkdir(target, { recursive: false });
    res.json({ ok: true, path: relative(root, target) });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/series/:slug/new-file', async (req, res) => {
  try {
    const root = seriesRoot(req.params.slug);
    let name = sanitizeName(req.body?.name || '');
    if (!name) return res.status(400).json({ error: 'Name required' });
    if (!/\.[^.]+$/.test(name)) name += '.md';
    const target = safeJoin(root, join(req.body?.path || '', name));
    if (existsSync(target)) return res.status(409).json({ error: 'Already exists' });
    await writeFile(target, '', 'utf8');
    res.json({ ok: true, path: relative(root, target) });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.patch('/api/series/:slug/rename', async (req, res) => {
  try {
    const root = seriesRoot(req.params.slug);
    const src = safeJoin(root, req.body?.path || '');
    if (src === root) return res.status(400).json({ error: 'Cannot rename root' });
    let newName = sanitizeName(req.body?.newName || '');
    if (!newName) return res.status(400).json({ error: 'Name required' });
    const srcStat = await stat(src);
    if (srcStat.isFile()) {
      const origExt = (basename(src).match(/\.[^.]+$/) || [''])[0];
      const stripped = newName.replace(/\.[^.]+$/, '');
      newName = (stripped || newName) + origExt;
    }
    const dst = safeJoin(root, join(dirname(relative(root, src)), newName));
    if (existsSync(dst)) return res.status(409).json({ error: 'Already exists' });
    await rename(src, dst);
    res.json({ ok: true, path: relative(root, dst) });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.delete('/api/series/:slug/entry', async (req, res) => {
  try {
    const root = seriesRoot(req.params.slug);
    const target = safeJoin(root, req.query.path || '');
    if (target === root) return res.status(400).json({ error: 'Cannot delete root' });
    await rm(target, { recursive: true, force: true });
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ─── Import (upload) ─────────────────────────────────────────────────────────

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      try {
        const root = seriesRoot(req.params.slug);
        const dest = safeJoin(root, req.query.path || '');
        if (!existsSync(dest)) return cb(new Error('Folder missing'));
        cb(null, dest);
      } catch (err) {
        cb(err);
      }
    },
    filename: (req, file, cb) => {
      const safe = sanitizeName(file.originalname);
      cb(null, safe || `import-${Date.now()}`);
    }
  }),
  limits: { fileSize: 50 * 1024 * 1024 }
});

app.post('/api/series/:slug/import', upload.array('files', 20), (req, res) => {
  res.json({
    ok: true,
    files: (req.files || []).map(f => ({ name: f.filename, size: f.size }))
  });
});

app.listen(PORT, () => {
  console.log(`episode-planner running at http://localhost:${PORT}`);
});
