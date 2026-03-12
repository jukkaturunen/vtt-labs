import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import OpenAI from 'openai';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '.env') });

const app = express();
const PORT = 3004;

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const XAI_API_KEY = process.env.XAI_API_KEY || '';

const openai = OPENAI_API_KEY ? new OpenAI({ apiKey: OPENAI_API_KEY }) : null;
const xai = XAI_API_KEY ? new OpenAI({ apiKey: XAI_API_KEY, baseURL: 'https://api.x.ai/v1' }) : null;

// Model configuration
const MODEL_CONFIG = {
  'gpt-image-1': {
    label: 'GPT Image (OpenAI)',
    client: () => openai,
    qualities: ['low', 'medium', 'high'],
    defaultQuality: 'low',
    supportsSize: true
  },
  'grok-imagine-image': {
    label: 'Grok Image (xAI)',
    client: () => xai,
    qualities: [],
    defaultQuality: null,
    supportsSize: false
  }
};

// Directories
const uploadsDir = path.join(__dirname, 'uploads');
const generatedDir = path.join(__dirname, 'generated');
[uploadsDir, generatedDir].forEach(d => { if (!fs.existsSync(d)) fs.mkdirSync(d); });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});
const upload = multer({ storage, limits: { fileSize: 20 * 1024 * 1024 } });

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(uploadsDir));
app.use('/generated', express.static(generatedDir));

// Upload reference images
app.post('/api/reference', upload.array('files', 10), (req, res) => {
  const files = req.files.map(f => ({
    id: f.filename,
    name: f.originalname,
    url: `/uploads/${f.filename}`
  }));
  res.json(files);
});

// List reference images
app.get('/api/references', (req, res) => {
  const files = fs.readdirSync(uploadsDir)
    .filter(f => /\.(jpg|jpeg|png|gif|webp)$/i.test(f))
    .map(f => ({
      id: f,
      name: f.replace(/^\d+-/, ''),
      url: `/uploads/${f}`
    }));
  res.json(files);
});

// ── Prompt Options (multi-dimensional prompt builder) ──
const PROMPT_OPTIONS = {
  setting: {
    label: 'Setting',
    options: [
      { id: 'high-fantasy', label: 'High Fantasy', expansion: 'high fantasy medieval world, stone castles and towers, ornate craftsmanship, a world where magic exists' },
      { id: 'dark-fantasy', label: 'Dark Fantasy', expansion: 'dark fantasy world, decayed grandeur, corrupted landscapes, bleak and weathered architecture' },
      { id: 'sword-sorcery', label: 'Sword & Sorcery', expansion: 'sword and sorcery world, ancient ruins, untamed wilderness, primal and dangerous setting' },
      { id: 'sci-fi', label: 'Science Fiction', expansion: 'science fiction setting, advanced technology, futuristic architecture, sleek metallic and glass surfaces' },
      { id: 'steampunk', label: 'Steampunk', expansion: 'steampunk world, Victorian-era architecture, brass and copper machinery, visible gears and steam pipes' },
      { id: 'horror', label: 'Horror', expansion: 'horror setting, decrepit and unsettling environment, wrong proportions, things not quite right' },
      { id: 'post-apocalyptic', label: 'Post-Apocalyptic', expansion: 'post-apocalyptic world, ruined modern structures reclaimed by nature, improvised repairs, scavenged materials' },
      { id: 'mythological', label: 'Mythological', expansion: 'ancient mythological world, monumental temples and sacred sites, larger-than-life scale' },
      { id: 'pirate-nautical', label: 'Pirate / Nautical', expansion: 'age of sail setting, wooden ships and harbors, rope and canvas, salt-weathered surfaces, tropical and maritime' },
      { id: 'western', label: 'Wild West', expansion: 'American frontier setting, sun-bleached wood buildings, dusty open terrain, rugged and sparse' },
      { id: 'gothic', label: 'Gothic', expansion: 'gothic setting, pointed arches and ribbed vaults, ornate stone tracery, vertical imposing architecture' },
      { id: 'fairy-tale', label: 'Fairy Tale', expansion: 'fairy tale world, storybook proportions, whimsical organic shapes, enchanted and idyllic' },
      { id: 'urban-modern', label: 'Urban Modern', expansion: 'contemporary urban setting, concrete and glass, modern infrastructure, present-day world' }
    ]
  },
  atmosphere: {
    label: 'Atmosphere',
    options: [
      { id: 'menacing', label: 'Menacing', expansion: 'menacing and threatening atmosphere, sense of lurking danger, oppressive tension' },
      { id: 'serene', label: 'Serene', expansion: 'serene and peaceful atmosphere, calm stillness, gentle and undisturbed' },
      { id: 'mysterious', label: 'Mysterious', expansion: 'mysterious atmosphere, secrets and hidden things, enigmatic and uncertain' },
      { id: 'epic', label: 'Epic', expansion: 'epic and grand atmosphere, awe-inspiring scale, momentous and powerful' },
      { id: 'melancholic', label: 'Melancholic', expansion: 'melancholic atmosphere, sadness and loss, faded beauty, bittersweet' },
      { id: 'festive', label: 'Festive', expansion: 'lively festive atmosphere, celebration and warmth, bustling energy' },
      { id: 'sacred', label: 'Sacred', expansion: 'sacred and reverent atmosphere, hallowed presence, solemn dignity' },
      { id: 'eerie', label: 'Eerie', expansion: 'eerie unsettling atmosphere, something subtly wrong, uncanny and disquieting' },
      { id: 'cozy', label: 'Cozy', expansion: 'cozy intimate atmosphere, warmth and shelter, comfortable and inviting' },
      { id: 'desolate', label: 'Desolate', expansion: 'desolate and abandoned atmosphere, emptiness and isolation, forsaken' },
      { id: 'chaotic', label: 'Chaotic', expansion: 'chaotic and turbulent atmosphere, disorder and upheaval, volatile energy' },
      { id: 'romantic', label: 'Romantic', expansion: 'romantic atmosphere, beauty and passion, heightened emotion, dramatic elegance' }
    ]
  },
  style: {
    label: 'Artistic Style',
    options: [
      { id: 'oil-painting', label: 'Oil Painting', expansion: 'classical oil painting style, rich impasto brushwork, visible canvas texture, warm varnish tones' },
      { id: 'watercolor', label: 'Watercolor', expansion: 'watercolor painting style, soft translucent washes, bleeding pigments, visible paper texture' },
      { id: 'concept-art', label: 'Concept Art', expansion: 'professional digital concept art, painterly strokes, bold color palette, matte painting quality' },
      { id: 'photorealistic', label: 'Photorealistic', expansion: 'photorealistic rendering, lifelike detail, natural lighting and materials, indistinguishable from photography' },
      { id: 'comic-book', label: 'Comic Book', expansion: 'comic book illustration style, bold ink outlines, cel shading, dynamic action poses, halftone dots' },
      { id: 'pixel-art', label: 'Pixel Art', expansion: 'pixel art style, retro 16-bit aesthetic, limited color palette, crisp pixel edges, nostalgic game art' },
      { id: 'ink-wash', label: 'Ink Wash', expansion: 'ink wash painting style, flowing black ink gradients, minimalist brushwork, East Asian artistic tradition' },
      { id: 'art-nouveau', label: 'Art Nouveau', expansion: 'Art Nouveau style, flowing organic lines, decorative floral borders, elegant curved forms, Mucha-inspired' },
      { id: 'woodcut', label: 'Woodcut Print', expansion: 'woodcut print style, bold carved lines, high contrast black and white, medieval illustration aesthetic' },
      { id: 'stained-glass', label: 'Stained Glass', expansion: 'stained glass window style, vibrant translucent colors, dark lead borders, radiant backlit glow' },
      { id: 'charcoal', label: 'Charcoal Sketch', expansion: 'charcoal sketch style, rough expressive strokes, smudged shadows, raw and unfinished energy, paper grain visible' }
    ]
  },
  lighting: {
    label: 'Lighting',
    options: [
      { id: 'candlelight', label: 'Candlelight', expansion: 'warm flickering candlelight and torchlight, dancing shadows on walls, intimate radius of orange illumination' },
      { id: 'golden-hour', label: 'Golden Hour', expansion: 'golden hour sunlight, warm amber rays casting long shadows, everything bathed in soft honey-colored light' },
      { id: 'moonlight', label: 'Moonlight', expansion: 'cool silver moonlight, pale blue illumination, deep night shadows, ethereal nocturnal glow' },
      { id: 'overcast', label: 'Overcast', expansion: 'soft diffused overcast light, even illumination without harsh shadows, muted and gentle atmosphere' },
      { id: 'dramatic', label: 'Dramatic Chiaroscuro', expansion: 'dramatic chiaroscuro lighting, extreme contrast between light and dark, single strong light source, Renaissance painting illumination' },
      { id: 'neon', label: 'Neon Glow', expansion: 'vibrant neon lighting, colored light reflections on wet surfaces, cyberpunk city glow, electric atmosphere' },
      { id: 'volumetric', label: 'Volumetric / God Rays', expansion: 'volumetric god rays streaming through openings, visible light beams cutting through dust and mist, cathedral-like illumination' },
      { id: 'bioluminescent', label: 'Bioluminescent', expansion: 'bioluminescent glow, organic light sources in blues and greens, glowing fungi and creatures, otherworldly natural illumination' },
      { id: 'firelight', label: 'Campfire', expansion: 'warm campfire light, flickering orange glow on faces, surrounding darkness held at bay, intimate gathering illumination' },
      { id: 'storm', label: 'Storm Lightning', expansion: 'dramatic storm lighting, lightning flash illumination, stark momentary brightness against dark clouds, electric atmosphere' },
      { id: 'underwater', label: 'Underwater Caustics', expansion: 'underwater caustic light patterns, dappled sunlight filtering through water surface, shifting ripple reflections' }
    ]
  },
  lens: {
    label: 'Camera / Lens',
    options: [
      { id: 'anamorphic', label: 'Anamorphic Cinema', expansion: 'anamorphic cinema lens, horizontal lens flares, oval bokeh, widescreen cinematic framing' },
      { id: 'wide-angle', label: 'Wide Angle', expansion: 'wide angle lens, expansive field of view, slight barrel distortion at edges, environmental storytelling' },
      { id: 'telephoto', label: 'Telephoto', expansion: 'telephoto lens compression, flattened depth, stacked background elements, creamy bokeh isolation' },
      { id: 'macro', label: 'Macro', expansion: 'macro lens extreme close-up, razor-thin depth of field, microscopic detail revealed, background dissolved into color' },
      { id: 'tilt-shift', label: 'Tilt-Shift', expansion: 'tilt-shift lens effect, selective focus creating miniature diorama appearance, toylike rendering of scene' },
      { id: 'fisheye', label: 'Fisheye', expansion: 'fisheye lens, extreme barrel distortion, 180-degree field of view, warped spherical perspective' },
      { id: 'portrait-85mm', label: 'Portrait 85mm', expansion: '85mm portrait lens, shallow depth of field, flattering subject compression, creamy background separation' },
      { id: 'vintage', label: 'Vintage Lens', expansion: 'vintage lens character, soft glow, chromatic aberration at edges, dreamy imperfect optics, film-era quality' },
      { id: 'drone', label: 'Drone / Aerial', expansion: 'drone aerial photography, elevated vantage point, sweeping landscape view, geographic context visible' },
      { id: 'infrared', label: 'Infrared', expansion: 'infrared photography style, false color rendering, white foliage, dark skies, surreal thermal vision aesthetic' }
    ]
  },
  angle: {
    label: 'Camera Angle',
    options: [
      { id: 'eye-level', label: 'Eye Level', expansion: 'eye-level perspective, natural human viewpoint, straightforward and grounded framing' },
      { id: 'low-angle', label: 'Low Angle', expansion: 'low angle shot looking upward, subject appears powerful and imposing, dramatic towering perspective' },
      { id: 'high-angle', label: 'High Angle', expansion: 'high angle looking down at the scene, subject appears smaller and vulnerable, overview perspective' },
      { id: 'birds-eye', label: "Bird's Eye", expansion: "bird's eye view, looking directly down at the scene from above, tactical map-like perspective" },
      { id: 'worms-eye', label: "Worm's Eye", expansion: "extreme worm's eye view from ground level looking straight up, towering verticals, dramatic sky visible" },
      { id: 'dutch-angle', label: 'Dutch Angle', expansion: 'dutch angle tilted camera, diagonal horizon line, creates tension and unease, off-kilter framing' },
      { id: 'over-shoulder', label: 'Over the Shoulder', expansion: 'over-the-shoulder shot, foreground figure partially visible, depth and perspective, voyeuristic framing' },
      { id: 'first-person', label: 'First Person / POV', expansion: 'first-person POV perspective, seeing through the character eyes, hands or weapon visible at frame edges' },
      { id: 'panoramic', label: 'Panoramic', expansion: 'ultra-wide panoramic view, sweeping horizontal composition, vast landscape stretching to horizon' },
      { id: 'isometric', label: 'Isometric', expansion: 'isometric projection angle, 30-degree elevated view, equal visual weight on all axes, strategy game perspective' }
    ]
  },
  ratio: {
    label: 'Aspect Ratio',
    options: [
      { id: '1:1', label: '1:1 Square', expansion: '', size: '1024x1024' },
      { id: '16:9', label: '16:9 Landscape', expansion: '', size: '1536x1024' },
      { id: '3:2', label: '3:2 Landscape', expansion: '', size: '1536x1024' },
      { id: '2:3', label: '2:3 Portrait', expansion: '', size: '1024x1536' }
    ]
  },
  mood: {
    label: 'Color Palette / Mood',
    options: [
      { id: 'warm', label: 'Warm & Inviting', expansion: 'warm color palette with ambers, golds, and rich earth tones, cozy and welcoming mood' },
      { id: 'cool', label: 'Cool & Serene', expansion: 'cool color palette with blues, teals, and soft silvers, calm and tranquil mood' },
      { id: 'dark', label: 'Dark & Ominous', expansion: 'very dark color palette, deep blacks and muted color accents, ominous and threatening mood' },
      { id: 'vibrant', label: 'Vibrant & Saturated', expansion: 'highly saturated vibrant colors, bold and eye-catching palette, energetic and lively mood' },
      { id: 'pastel', label: 'Pastel & Soft', expansion: 'soft pastel color palette, gentle muted tones, dreamy and delicate mood, low saturation' },
      { id: 'monochrome', label: 'Monochrome', expansion: 'monochromatic color scheme, single hue in varying shades and tints, unified and focused mood' },
      { id: 'autumn', label: 'Autumn Harvest', expansion: 'autumn color palette, deep reds, burnt oranges, golden yellows, and rich browns, harvest season mood' },
      { id: 'ethereal', label: 'Ethereal & Mystical', expansion: 'ethereal color palette with soft glowing purples, celestial blues, and shimmering gold, mystical otherworldly mood' },
      { id: 'desaturated', label: 'Desaturated & Gritty', expansion: 'desaturated gritty color palette, washed-out tones, bleak and harsh atmosphere, raw realism' },
      { id: 'complementary', label: 'Bold Complementary', expansion: 'bold complementary color contrast, opposing colors creating visual tension, dramatic and striking palette' }
    ]
  },
  composition: {
    label: 'Composition',
    options: [
      { id: 'rule-of-thirds', label: 'Rule of Thirds', expansion: 'rule of thirds composition, key subject placed at intersection points, balanced asymmetric framing' },
      { id: 'centered', label: 'Centered Symmetry', expansion: 'centered symmetrical composition, subject perfectly centered, balanced and formal visual weight' },
      { id: 'leading-lines', label: 'Leading Lines', expansion: 'leading lines composition, paths and edges guiding the eye toward the focal point, depth and direction' },
      { id: 'framed', label: 'Framed', expansion: 'framed composition, natural elements like archways or trees forming a frame around the main subject' },
      { id: 'negative-space', label: 'Negative Space', expansion: 'negative space composition, large empty areas contrasting with a small detailed subject, minimalist and impactful' },
      { id: 'layered', label: 'Layered Depth', expansion: 'layered depth composition, clear foreground, midground, and background elements creating rich spatial depth' },
      { id: 'diagonal', label: 'Diagonal', expansion: 'diagonal composition, strong diagonal lines creating dynamic energy and movement across the frame' },
      { id: 'fill-frame', label: 'Fill the Frame', expansion: 'fill the frame composition, subject fills the entire image with no wasted space, intense and immersive' },
      { id: 'golden-spiral', label: 'Golden Spiral', expansion: 'golden spiral composition, elements arranged along a logarithmic spiral, natural and pleasing flow' }
    ]
  },
  detail: {
    label: 'Detail Level',
    options: [
      { id: 'hyperdetail', label: 'Hyper-Detailed', expansion: 'hyper-detailed rendering, intricate fine details visible on every surface, obsessive precision' },
      { id: 'detailed', label: 'Detailed', expansion: 'highly detailed rendering with clear textures, materials, and surface qualities throughout' },
      { id: 'moderate', label: 'Moderate Detail', expansion: 'moderate level of detail, balanced between clarity and artistic impression, realistic without being obsessive' },
      { id: 'painterly', label: 'Painterly / Loose', expansion: 'loose painterly detail, visible brushstrokes suggesting form rather than defining it, artistic impression over precision' },
      { id: 'minimal', label: 'Minimal / Abstract', expansion: 'minimal detail, abstracted forms and shapes, essential elements only, stripped-down visual language' },
      { id: 'ornate', label: 'Ornate & Decorative', expansion: 'ornately decorated surfaces, intricate filigree and embellishments, baroque level of decorative detail' },
      { id: 'weathered', label: 'Weathered & Textured', expansion: 'heavily weathered and textured surfaces, visible wear, rust, cracks, and patina telling a story of age and use' },
      { id: 'clean', label: 'Clean & Pristine', expansion: 'clean pristine surfaces, sharp edges, immaculate condition, polished and unblemished materials' }
    ]
  }
};

// Category order for consistent iteration
const CATEGORY_ORDER = ['setting', 'atmosphere', 'style', 'lighting', 'lens', 'angle', 'ratio', 'mood', 'composition', 'detail'];

app.get('/api/prompt-options', (req, res) => {
  res.json({ categories: PROMPT_OPTIONS, order: CATEGORY_ORDER });
});

// Available models and their quality options
app.get('/api/models', (req, res) => {
  const models = Object.entries(MODEL_CONFIG)
    .filter(([, cfg]) => cfg.client() !== null) // only models with configured API keys
    .map(([id, cfg]) => ({
      id,
      label: cfg.label,
      qualities: cfg.qualities,
      defaultQuality: cfg.defaultQuality
    }));
  res.json(models);
});

// ── Generate image ──
app.post('/api/generate', async (req, res) => {
  const { prompt, selections = {}, model = 'gpt-image-1', quality, stylePrompt = '', custom_style = false } = req.body;
  const userPrompt = prompt;
  if (!prompt) return res.status(400).json({ error: 'prompt is required' });

  const modelCfg = MODEL_CONFIG[model];
  if (!modelCfg) return res.status(400).json({ error: `Unknown model: ${model}` });

  const client = modelCfg.client();
  if (!client) {
    return res.status(500).json({ error: `API key not configured for ${modelCfg.label}` });
  }

  // Combine style prompt with user's scene description
  const fullPrompt = stylePrompt.trim()
    ? `${stylePrompt.trim()}, ${prompt}`
    : prompt;

  // Resolve size from ratio selection
  let size = '1024x1024';
  if (selections.ratio) {
    const ratioOpt = PROMPT_OPTIONS.ratio.options.find(o => o.id === selections.ratio);
    if (ratioOpt) size = ratioOpt.size;
  }

  // Resolve quality
  const resolvedQuality = modelCfg.qualities.length > 0
    ? (quality && modelCfg.qualities.includes(quality) ? quality : modelCfg.defaultQuality)
    : null;

  try {
    const genParams = { model, prompt: fullPrompt, n: 1 };
    if (modelCfg.supportsSize) genParams.size = size;
    if (resolvedQuality) genParams.quality = resolvedQuality;

    const response = await client.images.generate(genParams);

    const filename = `gen-${Date.now()}.png`;
    const filepath = path.join(generatedDir, filename);
    let imageUrl;

    if (response.data[0].b64_json) {
      fs.writeFileSync(filepath, Buffer.from(response.data[0].b64_json, 'base64'));
    } else if (response.data[0].url) {
      // Download remote image (e.g. xAI returns URLs)
      const imgRes = await fetch(response.data[0].url);
      const arrBuf = await imgRes.arrayBuffer();
      fs.writeFileSync(filepath, Buffer.from(arrBuf));
    }

    imageUrl = `/generated/${filename}`;

    // Save metadata sidecar
    const meta = { userPrompt, selections, stylePrompt, custom_style, fullPrompt, size, model, quality: resolvedQuality, created: new Date().toISOString() };
    fs.writeFileSync(filepath.replace(/\.png$/, '.json'), JSON.stringify(meta));

    res.json({
      url: imageUrl,
      userPrompt,
      stylePrompt,
      custom_style,
      fullPrompt,
      selections,
      model,
      quality: resolvedQuality
    });
  } catch (err) {
    console.error('Generation error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// List generated images
app.get('/api/generated', (req, res) => {
  const files = fs.readdirSync(generatedDir)
    .filter(f => /\.(png|jpg|jpeg|webp)$/i.test(f))
    .sort((a, b) => b.localeCompare(a)) // newest first
    .map(f => {
      const entry = {
        id: f,
        url: `/generated/${f}`,
        created: fs.statSync(path.join(generatedDir, f)).mtime
      };
      // Load metadata sidecar if it exists
      const metaPath = path.join(generatedDir, f.replace(/\.(png|jpg|jpeg|webp)$/i, '.json'));
      if (fs.existsSync(metaPath)) {
        try { entry.meta = JSON.parse(fs.readFileSync(metaPath, 'utf8')); } catch {}
      }
      return entry;
    });
  res.json(files);
});

app.listen(PORT, () => {
  console.log(`\n  Scene Visualizer -> http://localhost:${PORT}`);
  console.log(`  OpenAI: ${OPENAI_API_KEY ? 'configured' : 'not configured'}`);
  console.log(`  xAI:    ${XAI_API_KEY ? 'configured' : 'not configured'}`);
  const totalOptions = CATEGORY_ORDER.reduce((sum, cat) => sum + PROMPT_OPTIONS[cat].options.length, 0);
  console.log(`  ${CATEGORY_ORDER.length} prompt categories, ${totalOptions} options available\n`);
});
