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
const PORT = 3006;

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const XAI_API_KEY = process.env.XAI_API_KEY || '';
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY || '';

const openai = OPENAI_API_KEY ? new OpenAI({ apiKey: OPENAI_API_KEY }) : null;
const xai = XAI_API_KEY ? new OpenAI({ apiKey: XAI_API_KEY, baseURL: 'https://api.x.ai/v1' }) : null;

async function geminiGenerate(prompt) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=${GOOGLE_API_KEY}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseModalities: ['TEXT', 'IMAGE'] }
    })
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `Gemini API error: ${res.status}`);
  }
  const data = await res.json();
  const parts = data.candidates?.[0]?.content?.parts || [];
  const imagePart = parts.find(p => p.inlineData?.mimeType?.startsWith('image/'));
  if (!imagePart) throw new Error('Gemini did not return an image');
  return { b64_json: imagePart.inlineData.data };
}

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
  },
  'gemini-2.5-flash-image': {
    label: 'Gemini Flash (Google)',
    client: () => GOOGLE_API_KEY ? 'gemini' : null,
    qualities: [],
    defaultQuality: null,
    supportsSize: false,
    customGenerate: true
  }
};

const SUBJECT_ANCHOR = '1 person, solo, single subject, alone';
const NPC_IMAGE_SIZE = '1024x1536'; // portrait orientation

const NPC_OPTIONS = {
  // ── Identity ──
  species: {
    group: 'Identity',
    label: 'Species',
    type: 'select',
    options: [
      { id: 'human', label: 'Human', expansion: 'human, natural proportions, diverse facial features' },
      { id: 'elf', label: 'Elf', expansion: 'elf, elven features, pointed ears, ageless complexion, refined angular face' },
      { id: 'dwarf', label: 'Dwarf', expansion: 'dwarf, stout build, broad face, strong jaw, compact stocky proportions' },
      { id: 'half-elf', label: 'Half-Elf', expansion: 'half-elf, slightly pointed ears, blend of human and elven traits' },
      { id: 'orc', label: 'Orc / Half-Orc', expansion: 'half-orc, prominent tusks, green-grey skin, heavy brow ridge, powerful build' },
      { id: 'halfling', label: 'Halfling', expansion: 'halfling, small stature, large round feet, jovial face, youthful appearance' },
      { id: 'tiefling', label: 'Tiefling', expansion: 'tiefling, small horns, pointed tail, solid-colored eyes, infernal heritage visible in features' },
      { id: 'gnome', label: 'Gnome', expansion: 'gnome, small stature, large expressive eyes, prominent nose, lively face' },
      { id: 'dragonborn', label: 'Dragonborn', expansion: 'dragonborn, draconic scales covering skin, reptilian eyes, no hair, snout-like muzzle' },
      { id: 'custom', label: 'Custom...', expansion: '' }
    ]
  },
  age: {
    group: 'Identity',
    label: 'Age',
    type: 'select',
    options: [
      { id: 'child', label: 'Child', expansion: 'child approximately 10 years old, youthful face, small frame' },
      { id: 'teen', label: 'Teen', expansion: 'teenager approximately 15-17 years old, adolescent features' },
      { id: 'young-adult', label: 'Young Adult', expansion: 'young adult in early twenties, fresh and energetic' },
      { id: 'adult', label: 'Adult', expansion: 'adult in their thirties, mature and confident' },
      { id: 'middle-aged', label: 'Middle-Aged', expansion: 'middle-aged approximately 45-50, distinguished, beginning to show age' },
      { id: 'mature', label: 'Mature', expansion: 'mature individual approximately 55-65, weathered and experienced' },
      { id: 'elderly', label: 'Elderly', expansion: 'elderly, deeply aged face, pronounced wrinkles, grey or white hair' }
    ]
  },
  gender: {
    group: 'Identity',
    label: 'Gender Presentation',
    type: 'select',
    options: [
      { id: 'male', label: 'Male', expansion: 'male, masculine features' },
      { id: 'female', label: 'Female', expansion: 'female, feminine features' },
      { id: 'androgynous', label: 'Androgynous', expansion: 'androgynous appearance, ambiguous gender presentation, blended features' },
      { id: 'nonbinary', label: 'Non-Binary', expansion: 'non-binary presentation, gender-neutral features' }
    ]
  },
  ethnicity: {
    group: 'Identity',
    label: 'Ethnicity',
    type: 'select',
    options: [
      { id: 'northern-european', label: 'Northern European', expansion: 'Northern European features, fair skin, light eyes, often light hair' },
      { id: 'mediterranean', label: 'Mediterranean', expansion: 'Mediterranean features, olive complexion, dark hair and eyes' },
      { id: 'east-asian', label: 'East Asian', expansion: 'East Asian features, epicanthic fold, straight dark hair, warm skin tone' },
      { id: 'south-asian', label: 'South Asian', expansion: 'South Asian features, warm brown skin, dark eyes and hair' },
      { id: 'middle-eastern', label: 'Middle Eastern', expansion: 'Middle Eastern features, olive to brown skin, dark eyes, strong facial structure' },
      { id: 'east-african', label: 'East African', expansion: 'East African features, dark rich skin tone, angular refined features' },
      { id: 'west-african', label: 'West African', expansion: 'West African features, deep brown skin, broad facial structure' },
      { id: 'native-american', label: 'Native American', expansion: 'Native American features, warm copper-brown skin, prominent cheekbones, dark hair' },
      { id: 'latino', label: 'Latino / Latina', expansion: 'Latino features, warm mixed heritage skin tone, varied facial structure' },
      { id: 'slavic', label: 'Slavic', expansion: 'Slavic features, pale complexion, high cheekbones' },
      { id: 'mixed', label: 'Mixed Heritage', expansion: 'mixed heritage features, blended multicultural appearance' }
    ]
  },
  // ── Physique ──
  build: {
    group: 'Physique',
    label: 'Build',
    type: 'select',
    options: [
      { id: 'lean', label: 'Lean / Slender', expansion: 'lean slender build, lithe and wiry frame' },
      { id: 'athletic', label: 'Athletic', expansion: 'athletic build, toned and fit, healthy physique' },
      { id: 'muscular', label: 'Muscular', expansion: 'heavily muscular build, powerful physique, broad shoulders, thick arms' },
      { id: 'average', label: 'Average', expansion: 'average build, typical proportions' },
      { id: 'curvy', label: 'Curvy', expansion: 'curvy build, full figure with rounded proportions' },
      { id: 'stocky', label: 'Stocky', expansion: 'stocky compact build, solid broad frame' },
      { id: 'heavy-set', label: 'Heavy-Set', expansion: 'heavy-set build, large substantial frame' }
    ]
  },
  height: {
    group: 'Physique',
    label: 'Height',
    type: 'select',
    options: [
      { id: 'very-short', label: 'Very Short', expansion: 'very short stature, noticeably small' },
      { id: 'short', label: 'Short', expansion: 'short stature, below average height' },
      { id: 'average-height', label: 'Average', expansion: 'average height' },
      { id: 'tall', label: 'Tall', expansion: 'tall stature, above average height' },
      { id: 'very-tall', label: 'Very Tall', expansion: 'very tall stature, towering presence' }
    ]
  },
  skin: {
    group: 'Physique',
    label: 'Skin Tone',
    type: 'select',
    options: [
      { id: 'pale', label: 'Pale / Porcelain', expansion: 'pale porcelain skin, nearly white complexion' },
      { id: 'fair', label: 'Fair', expansion: 'fair light skin tone' },
      { id: 'tan', label: 'Tan / Sun-Kissed', expansion: 'tan sun-kissed skin, bronzed from outdoor exposure' },
      { id: 'olive', label: 'Olive', expansion: 'olive skin tone, warm Mediterranean complexion' },
      { id: 'brown', label: 'Brown', expansion: 'medium brown skin tone' },
      { id: 'dark', label: 'Dark / Deep Brown', expansion: 'dark deep brown skin, rich complexion' },
      { id: 'weathered', label: 'Weathered / Scarred', expansion: 'weathered scarred skin, sun-damaged and worn, marks of a hard life' },
      { id: 'freckled', label: 'Freckled', expansion: 'freckled skin with scattered freckles across face and arms' }
    ]
  },
  // ── Face & Hair ──
  eye_color: {
    group: 'Face & Hair',
    label: 'Eye Color',
    type: 'select',
    options: [
      { id: 'brown-eyes', label: 'Brown', expansion: 'brown eyes' },
      { id: 'hazel-eyes', label: 'Hazel', expansion: 'hazel eyes, green-brown blend' },
      { id: 'blue-eyes', label: 'Blue', expansion: 'blue eyes' },
      { id: 'green-eyes', label: 'Green', expansion: 'green eyes' },
      { id: 'gray-eyes', label: 'Gray', expansion: 'gray steel-colored eyes' },
      { id: 'amber-eyes', label: 'Amber / Gold', expansion: 'amber golden eyes' },
      { id: 'violet-eyes', label: 'Violet (Fantasy)', expansion: 'violet purple eyes' },
      { id: 'silver-eyes', label: 'Silver (Fantasy)', expansion: 'silver metallic eyes' },
      { id: 'heterochromia', label: 'Heterochromia', expansion: 'heterochromia, each eye a different color' }
    ]
  },
  hair: {
    group: 'Face & Hair',
    label: 'Hair Style',
    type: 'select',
    options: [
      { id: 'bald', label: 'Bald / Shaved', expansion: 'bald or closely shaved head' },
      { id: 'buzzcut', label: 'Buzzcut', expansion: 'buzzcut, very short cropped hair' },
      { id: 'short-hair', label: 'Short', expansion: 'short hair' },
      { id: 'medium-hair', label: 'Medium', expansion: 'medium length hair, at or above shoulders' },
      { id: 'long-hair', label: 'Long', expansion: 'long hair flowing past shoulders' },
      { id: 'short-curly', label: 'Short Curly', expansion: 'short curly hair' },
      { id: 'curly-afro', label: 'Long Curly / Afro', expansion: 'long curly hair or natural afro' },
      { id: 'dreadlocks', label: 'Dreadlocks', expansion: 'dreadlocks' },
      { id: 'braided', label: 'Braided', expansion: 'braided hair' },
      { id: 'ponytail', label: 'Ponytail', expansion: 'hair pulled back in a ponytail' },
      { id: 'wild', label: 'Wild / Unkempt', expansion: 'wild unkempt disheveled hair' }
    ]
  },
  hair_color: {
    group: 'Face & Hair',
    label: 'Hair Color',
    type: 'select',
    options: [
      { id: 'black-hair', label: 'Black', expansion: 'black hair' },
      { id: 'dark-brown-hair', label: 'Dark Brown', expansion: 'dark brown hair' },
      { id: 'brown-hair', label: 'Brown', expansion: 'brown hair' },
      { id: 'auburn-hair', label: 'Auburn', expansion: 'auburn hair, reddish-brown' },
      { id: 'red-hair', label: 'Red / Ginger', expansion: 'red ginger hair' },
      { id: 'blonde-hair', label: 'Blonde', expansion: 'blonde hair' },
      { id: 'platinum-hair', label: 'Platinum / White-Blonde', expansion: 'platinum white-blonde hair' },
      { id: 'gray-hair', label: 'Gray / Silver', expansion: 'gray silver hair' },
      { id: 'white-hair', label: 'White', expansion: 'white hair' },
      { id: 'multicolor-hair', label: 'Multicolor (Fantasy)', expansion: 'multicolored fantasy hair with magical coloration' }
    ]
  },
  facial_hair: {
    group: 'Face & Hair',
    label: 'Facial Hair',
    type: 'select',
    options: [
      { id: 'clean-shaven', label: 'None / Clean-Shaven', expansion: 'clean-shaven, no facial hair' },
      { id: 'stubble', label: 'Stubble', expansion: 'light stubble, few days of growth' },
      { id: 'mustache', label: 'Mustache', expansion: 'mustache' },
      { id: 'goatee', label: 'Goatee', expansion: 'goatee' },
      { id: 'short-beard', label: 'Short Beard', expansion: 'short trimmed beard' },
      { id: 'full-beard', label: 'Full Beard', expansion: 'full thick beard' },
      { id: 'long-beard', label: 'Long Beard', expansion: 'long flowing beard' }
    ]
  },
  // ── Distinctive Features (multi-select) ──
  features: {
    group: 'Distinctive Features',
    label: 'Distinctive Features',
    type: 'multi',
    options: [
      { id: 'facial-scar', label: 'Facial Scar', expansion: 'prominent facial scar' },
      { id: 'body-scars', label: 'Body Scars', expansion: 'visible body scars' },
      { id: 'tattoos', label: 'Tattoos', expansion: 'tattoos on visible skin' },
      { id: 'piercings', label: 'Piercings', expansion: 'piercings' },
      { id: 'eye-patch', label: 'Eye Patch', expansion: 'eye patch over one eye' },
      { id: 'prosthetic', label: 'Prosthetic Limb', expansion: 'prosthetic limb visible' },
      { id: 'heavy-freckles', label: 'Freckles', expansion: 'heavy freckles' },
      { id: 'birthmark', label: 'Birthmark', expansion: 'prominent birthmark' },
      { id: 'vitiligo', label: 'Vitiligo', expansion: 'vitiligo patches on skin' },
      { id: 'beard-braids', label: 'Beard Braids', expansion: 'braided beard with beads' },
      { id: 'war-paint', label: 'War Paint', expansion: 'war paint or face markings' }
    ]
  },
  // ── Attire & Equipment ──
  attire_style: {
    group: 'Attire & Equipment',
    label: 'Attire Style',
    type: 'select',
    options: [
      { id: 'high-fantasy', label: 'High Fantasy', expansion: 'high fantasy attire, ornate medieval clothing, rich fabrics and detailed craftsmanship' },
      { id: 'battle-armor', label: 'Battle Armor', expansion: 'heavy battle armor, plate or chainmail, warrior equipment' },
      { id: 'mage-robes', label: 'Mage Robes', expansion: 'flowing mage robes, arcane garments, mystical symbols and sigils' },
      { id: 'ranger-scout', label: 'Ranger / Scout', expansion: 'practical ranger attire, worn leather, earthy camouflage tones, traveler gear' },
      { id: 'noble-finery', label: 'Noble Finery', expansion: 'noble finery, expensive fabrics, formal aristocratic dress, jewelry and embroidery' },
      { id: 'peasant', label: 'Peasant / Common', expansion: 'simple common clothing, rough-spun fabrics, worn and practical' },
      { id: 'pirate', label: 'Pirate / Seafarer', expansion: 'pirate seafarer attire, tricorn hat, long coat, nautical rope and buckle details' },
      { id: 'rogue', label: 'Rogue / Assassin', expansion: 'dark concealing rogue attire, hooded, form-fitting with hidden pockets' },
      { id: 'priest', label: 'Priest / Cleric', expansion: 'priestly vestments, religious symbols and iconography, ceremonial robes' },
      { id: 'barbarian', label: 'Barbarian / Tribal', expansion: 'barbarian tribal attire, furs and rough leather, primitive adornments' },
      { id: 'urban-modern', label: 'Urban Modern', expansion: 'contemporary urban clothing, casual modern style, street fashion' }
    ]
  },
  accessories: {
    group: 'Attire & Equipment',
    label: 'Accessories & Equipment',
    type: 'multi',
    options: [
      { id: 'sword', label: 'Sword / Blade', expansion: 'sword or blade weapon' },
      { id: 'staff', label: 'Staff / Wand', expansion: 'staff or wand' },
      { id: 'bow', label: 'Bow / Quiver', expansion: 'bow with quiver of arrows' },
      { id: 'shield', label: 'Shield', expansion: 'shield' },
      { id: 'spellbook', label: 'Spell Book', expansion: 'arcane spell book or tome' },
      { id: 'amulet', label: 'Amulet / Pendant', expansion: 'amulet or pendant necklace' },
      { id: 'hat', label: 'Hat / Headwear', expansion: 'distinctive hat or headwear' },
      { id: 'cloak', label: 'Cloak / Cape', expansion: 'cloak or cape' },
      { id: 'pack', label: "Traveler's Pack", expansion: "traveler's pack or backpack" },
      { id: 'jewelry', label: 'Jewelry', expansion: 'rings, bracelets, and jewelry' },
      { id: 'instrument', label: 'Musical Instrument', expansion: 'musical instrument' },
      { id: 'pipe', label: 'Smoking Pipe', expansion: 'smoking pipe' }
    ]
  },
  // ── Expression & Pose ──
  expression: {
    group: 'Expression & Pose',
    label: 'Expression',
    type: 'select',
    options: [
      { id: 'neutral', label: 'Neutral', expansion: 'neutral calm expression, composed' },
      { id: 'stoic', label: 'Stoic', expansion: 'stoic impassive expression, unreadable' },
      { id: 'stern', label: 'Stern / Serious', expansion: 'stern serious expression, grave and focused' },
      { id: 'friendly', label: 'Friendly / Smiling', expansion: 'warm friendly smile, welcoming expression' },
      { id: 'smirk', label: 'Smirk / Cunning', expansion: 'cunning smirk, knowing and sly' },
      { id: 'suspicious', label: 'Suspicious', expansion: 'suspicious cautious expression, wary guarded look' },
      { id: 'fierce', label: 'Intense / Fierce', expansion: 'intense fierce expression, burning determined gaze' },
      { id: 'weary', label: 'Weary / Battle-Worn', expansion: 'weary battle-worn expression, tired but unbroken' },
      { id: 'wise', label: 'Wise / Thoughtful', expansion: 'wise thoughtful expression, deep in contemplation' },
      { id: 'menacing', label: 'Menacing', expansion: 'menacing threatening expression, dangerous intimidating aura' },
      { id: 'joyful', label: 'Joyful', expansion: 'joyful exuberant expression, bright and lively' }
    ]
  },
  pose: {
    group: 'Expression & Pose',
    label: 'Pose',
    type: 'select',
    options: [
      { id: 'standing-proud', label: 'Standing Proud', expansion: 'standing proud and upright, confident commanding posture' },
      { id: 'arms-crossed', label: 'Arms Crossed', expansion: 'arms crossed, guarded or authoritative stance' },
      { id: 'hands-hips', label: 'Hands on Hips', expansion: 'hands on hips, assertive stance' },
      { id: 'relaxed', label: 'Relaxed / Casual', expansion: 'relaxed casual pose, at ease' },
      { id: 'combat-ready', label: 'Combat Ready', expansion: 'combat ready stance, poised for battle, weapon drawn' },
      { id: 'seated', label: 'Seated', expansion: 'seated pose, at rest' },
      { id: 'leaning', label: 'Leaning', expansion: 'leaning casually against a surface' },
      { id: 'walking', label: 'Walking / Moving', expansion: 'mid-stride walking pose, dynamic movement' }
    ]
  },
  // ── Presentation ──
  shot: {
    group: 'Presentation',
    label: 'Shot Type',
    type: 'select',
    options: [
      { id: 'portrait', label: 'Portrait (Head & Shoulders)', expansion: 'portrait framing, head and shoulders visible, intimate close shot' },
      { id: 'bust', label: 'Bust Shot (Waist Up)', expansion: 'bust shot, waist up visible, medium framing' },
      { id: 'full-body', label: 'Full Body', expansion: 'full body shot, entire figure from head to toe visible' },
      { id: 'closeup', label: 'Close-Up (Face)', expansion: 'extreme close-up, face fills the frame' }
    ]
  },
  style: {
    group: 'Presentation',
    label: 'Artistic Style',
    type: 'select',
    options: [
      { id: 'photorealistic', label: 'Photorealistic', expansion: 'photorealistic rendering, lifelike detail, natural lighting and materials' },
      { id: 'oil-painting', label: 'Oil Painting', expansion: 'classical oil painting style, rich impasto brushwork, visible canvas texture' },
      { id: 'concept-art', label: 'Concept Art', expansion: 'professional digital concept art, painterly style, bold color palette' },
      { id: 'watercolor', label: 'Watercolor', expansion: 'watercolor painting style, soft translucent washes, paper texture' },
      { id: 'comic-book', label: 'Comic Book', expansion: 'comic book illustration, bold ink outlines, cel shading' },
      { id: 'charcoal', label: 'Charcoal Sketch', expansion: 'charcoal sketch, expressive strokes, smudged shadows, raw energy' },
      { id: 'art-nouveau', label: 'Art Nouveau', expansion: 'Art Nouveau style, flowing organic lines, decorative floral borders, Mucha-inspired' },
      { id: 'dark-fantasy', label: 'Dark Fantasy Realism', expansion: 'dark fantasy realism, gritty detailed rendering, dramatic moody atmosphere' }
    ]
  },
  lighting: {
    group: 'Presentation',
    label: 'Lighting',
    type: 'select',
    options: [
      { id: 'studio', label: 'Studio / Neutral', expansion: 'studio neutral lighting, even clean illumination, professional setup' },
      { id: 'chiaroscuro', label: 'Dramatic Chiaroscuro', expansion: 'dramatic chiaroscuro lighting, extreme light-dark contrast, single strong light source' },
      { id: 'rim-light', label: 'Rim Light', expansion: 'rim lighting, bright edge light outlining the subject from behind' },
      { id: 'candlelight', label: 'Candlelight / Firelight', expansion: 'warm candlelight or firelight, flickering orange glow, intimate illumination' },
      { id: 'golden-hour', label: 'Golden Hour', expansion: 'golden hour sunlight, warm amber rays, soft honey-colored light' },
      { id: 'moonlight', label: 'Moonlight / Night', expansion: 'cool silver moonlight, pale blue illumination, nocturnal atmosphere' },
      { id: 'ethereal', label: 'Ethereal / Magical', expansion: 'ethereal magical lighting, soft glowing purples and golds, mystical radiant illumination' },
      { id: 'neon', label: 'Neon / Colored', expansion: 'vibrant neon colored lighting, electric color cast, dramatic colored light' }
    ]
  },
  background: {
    group: 'Presentation',
    label: 'Background',
    type: 'select',
    options: [
      { id: 'dark-void', label: 'Dark Void', expansion: 'pure dark void background, subject isolated on black' },
      { id: 'neutral-studio', label: 'Neutral Studio', expansion: 'neutral studio backdrop, clean simple background' },
      { id: 'tavern', label: 'Tavern Interior', expansion: 'warm tavern interior background, wooden beams, candles, tankards' },
      { id: 'throne-room', label: 'Throne Room / Hall', expansion: 'grand throne room or hall, stone columns, regal architecture' },
      { id: 'dungeon', label: 'Dungeon / Cave', expansion: 'dungeon or cave background, rough stone walls, torchlight' },
      { id: 'forest', label: 'Forest / Wilderness', expansion: 'forest or wilderness background, trees and natural environment' },
      { id: 'city', label: 'Medieval City / Town', expansion: 'medieval city or cobblestone town, buildings and architecture' },
      { id: 'harbor', label: 'Harbor / Docks', expansion: 'harbor or docks background, water and ships, nautical setting' },
      { id: 'magical-realm', label: 'Magical Realm', expansion: 'otherworldly magical realm, fantastical glowing landscape' }
    ]
  }
};

const CATEGORY_ORDER = [
  'species', 'age', 'gender', 'ethnicity',
  'build', 'height', 'skin',
  'eye_color', 'hair', 'hair_color', 'facial_hair',
  'features',
  'attire_style', 'accessories',
  'expression', 'pose',
  'shot', 'style', 'lighting', 'background'
];

const GROUPS = [
  'Identity', 'Physique', 'Face & Hair',
  'Distinctive Features', 'Attire & Equipment',
  'Expression & Pose', 'Presentation'
];

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

app.post('/api/reference', upload.array('files', 10), (req, res) => {
  const files = req.files.map(f => ({
    id: f.filename,
    name: f.originalname,
    url: `/uploads/${f.filename}`
  }));
  res.json(files);
});

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

app.get('/api/npc-options', (req, res) => {
  res.json({ groups: GROUPS, options: NPC_OPTIONS, order: CATEGORY_ORDER });
});

app.get('/api/models', (req, res) => {
  const models = Object.entries(MODEL_CONFIG)
    .filter(([, cfg]) => cfg.client() !== null)
    .map(([id, cfg]) => ({
      id,
      label: cfg.label,
      qualities: cfg.qualities,
      defaultQuality: cfg.defaultQuality
    }));
  res.json(models);
});

app.post('/api/generate', async (req, res) => {
  const { prompt, characterPrompt = '', custom_character = false, selections = {}, customInputs = {}, model = 'gpt-image-1', quality } = req.body;
  if (!prompt && !characterPrompt) return res.status(400).json({ error: 'prompt is required' });

  const modelCfg = MODEL_CONFIG[model];
  if (!modelCfg) return res.status(400).json({ error: `Unknown model: ${model}` });

  const client = modelCfg.client();
  if (!client) return res.status(500).json({ error: `API key not configured for ${modelCfg.label}` });

  // Build full prompt: subject anchor + character profile + user description
  const parts = [SUBJECT_ANCHOR];
  if (characterPrompt.trim()) parts.push(characterPrompt.trim());
  if (prompt.trim()) parts.push(prompt.trim());
  const fullPrompt = parts.join(', ');

  const resolvedQuality = modelCfg.qualities.length > 0
    ? (quality && modelCfg.qualities.includes(quality) ? quality : modelCfg.defaultQuality)
    : null;

  try {
    const filename = `gen-${Date.now()}.png`;
    const filepath = path.join(generatedDir, filename);

    if (modelCfg.customGenerate) {
      const result = await geminiGenerate(fullPrompt);
      fs.writeFileSync(filepath, Buffer.from(result.b64_json, 'base64'));
    } else {
      const genParams = { model, prompt: fullPrompt, n: 1 };
      if (modelCfg.supportsSize) genParams.size = NPC_IMAGE_SIZE;
      if (resolvedQuality) genParams.quality = resolvedQuality;

      const response = await client.images.generate(genParams);

      if (response.data[0].b64_json) {
        fs.writeFileSync(filepath, Buffer.from(response.data[0].b64_json, 'base64'));
      } else if (response.data[0].url) {
        const imgRes = await fetch(response.data[0].url);
        const arrBuf = await imgRes.arrayBuffer();
        fs.writeFileSync(filepath, Buffer.from(arrBuf));
      }
    }

    const imageUrl = `/generated/${filename}`;
    const meta = {
      userPrompt: prompt,
      characterPrompt,
      custom_character,
      selections,
      customInputs,
      fullPrompt,
      model,
      quality: resolvedQuality,
      created: new Date().toISOString()
    };
    fs.writeFileSync(filepath.replace(/\.png$/, '.json'), JSON.stringify(meta));

    res.json({ url: imageUrl, ...meta });
  } catch (err) {
    console.error('Generation error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/generated', (req, res) => {
  const files = fs.readdirSync(generatedDir)
    .filter(f => /\.(png|jpg|jpeg|webp)$/i.test(f))
    .sort((a, b) => b.localeCompare(a))
    .map(f => {
      const entry = {
        id: f,
        url: `/generated/${f}`,
        created: fs.statSync(path.join(generatedDir, f)).mtime
      };
      const metaPath = path.join(generatedDir, f.replace(/\.(png|jpg|jpeg|webp)$/i, '.json'));
      if (fs.existsSync(metaPath)) {
        try { entry.meta = JSON.parse(fs.readFileSync(metaPath, 'utf8')); } catch {}
      }
      return entry;
    });
  res.json(files);
});

app.listen(PORT, () => {
  console.log(`\n  NPC Visualizer -> http://localhost:${PORT}`);
  console.log(`  OpenAI: ${OPENAI_API_KEY ? 'configured' : 'not configured'}`);
  console.log(`  xAI:    ${XAI_API_KEY ? 'configured' : 'not configured'}`);
  console.log(`  Google: ${GOOGLE_API_KEY ? 'configured' : 'not configured'}`);
  const multiCount = CATEGORY_ORDER.filter(k => NPC_OPTIONS[k]?.type === 'multi').length;
  const singleCount = CATEGORY_ORDER.length - multiCount;
  console.log(`  ${singleCount} select + ${multiCount} multi-select categories across ${GROUPS.length} groups\n`);
});
