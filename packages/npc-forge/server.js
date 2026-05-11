import 'dotenv/config';
import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, join, extname } from 'path';
import { readdir, writeFile, readFile, unlink, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import multer from 'multer';
import OpenAI from 'openai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const app = express();
const PORT = 3007;

// Ensure directories exist
const GENERATED_DIR = join(__dirname, 'generated');
const UPLOADS_DIR = join(__dirname, 'uploads');
for (const dir of [GENERATED_DIR, UPLOADS_DIR]) {
  if (!existsSync(dir)) await mkdir(dir, { recursive: true });
}

// Middleware
app.use(express.json({ limit: '50mb' }));
app.use('/generated', express.static(GENERATED_DIR));
app.use('/uploads', express.static(UPLOADS_DIR));
app.use(express.static(join(__dirname, 'public')));

// File upload
const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOADS_DIR,
    filename: (req, file, cb) => cb(null, `ref-${Date.now()}-${file.originalname}`)
  }),
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
    cb(null, allowed.includes(extname(file.originalname).toLowerCase()));
  }
});

// ─── AI Clients ───────────────────────────────────────────────────────────────

const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

const xai = process.env.XAI_API_KEY
  ? new OpenAI({ apiKey: process.env.XAI_API_KEY, baseURL: 'https://api.x.ai/v1' })
  : null;

const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY || null;

const MODEL_CONFIG = {
  'gpt-image-1': {
    label: 'GPT Image (OpenAI)',
    provider: 'openai',
    client: () => openai,
    qualities: ['low', 'medium', 'high'],
    defaultQuality: 'low',
    supportsSize: true
  },
  'grok-imagine-image': {
    label: 'Grok Image (xAI)',
    provider: 'xai',
    client: () => xai,
    qualities: [],
    defaultQuality: null,
    supportsSize: false
  },
  'gemini-2.5-flash-image': {
    label: 'Gemini Flash (Google)',
    provider: 'gemini',
    client: () => GOOGLE_API_KEY ? 'gemini' : null,
    qualities: [],
    defaultQuality: null,
    supportsSize: false,
    customGenerate: true
  }
};

// ─── Genres ───────────────────────────────────────────────────────────────────

const GENRES = [
  { id: 'fantasy', label: 'Fantasy', icon: '🏰',
    description: 'Medieval fantasy, magic, swords & sorcery',
    promptPrefix: 'fantasy setting' },
  { id: 'scifi', label: 'Sci-Fi', icon: '🚀',
    description: 'Space opera, alien worlds, future tech',
    promptPrefix: 'science fiction setting, futuristic' },
  { id: 'cyberpunk', label: 'Cyberpunk', icon: '🌃',
    description: 'Neon dystopia, augmented humans, megacorps',
    promptPrefix: 'cyberpunk setting, neon-lit, high-tech low-life' },
  { id: 'horror', label: 'Horror', icon: '🩸',
    description: 'Supernatural terror, gothic darkness, cosmic dread',
    promptPrefix: 'horror setting, dark, unsettling atmosphere' },
  { id: 'modern', label: 'Modern', icon: '🏙️',
    description: 'Contemporary real-world characters',
    promptPrefix: 'modern contemporary setting' },
  { id: 'postapoc', label: 'Post-Apoc', icon: '☢️',
    description: 'Wasteland survival, ruins, mutations',
    promptPrefix: 'post-apocalyptic setting, ruined world' },
  { id: 'steampunk', label: 'Steampunk', icon: '⚙️',
    description: 'Victorian era, steam power, clockwork',
    promptPrefix: 'steampunk setting, Victorian era, brass and gears' },
  { id: 'western', label: 'Western', icon: '🤠',
    description: 'Frontier towns, gunslingers, the Wild West',
    promptPrefix: 'Wild West setting, frontier era' },
];

// ─── Archetypes ───────────────────────────────────────────────────────────────
// Each archetype has a `genre` field for filtering. Defaults reference trait option IDs.

const ARCHETYPES = [
  // ── Fantasy ──
  { id: 'warrior', label: 'Warrior', icon: '⚔️', genre: 'fantasy',
    description: 'Battle-hardened fighter in heavy armor',
    defaults: { build: 'muscular', attire: 'plate-armor', weapon: 'sword-shield',
      expression: 'determined', pose: 'combat-ready', background: 'battlefield' } },
  { id: 'mage', label: 'Mage', icon: '🔮', genre: 'fantasy',
    description: 'Arcane spellcaster wielding mystical power',
    defaults: { build: 'lean', attire: 'mage-robes', weapon: 'staff-wand',
      expression: 'focused', pose: 'casting', background: 'arcane-tower',
      accessories: ['spell-book', 'amulet'] } },
  { id: 'rogue', label: 'Rogue', icon: '🗡️', genre: 'fantasy',
    description: 'Stealthy operative working in the shadows',
    defaults: { build: 'lean', attire: 'leather-dark', weapon: 'daggers',
      expression: 'sly', pose: 'lurking', background: 'dark-alley',
      accessories: ['cloak-hood'] } },
  { id: 'ranger', label: 'Ranger', icon: '🏹', genre: 'fantasy',
    description: 'Wilderness tracker and expert marksman',
    defaults: { build: 'athletic', attire: 'ranger-garb', weapon: 'bow-quiver',
      expression: 'vigilant', pose: 'standing-alert', background: 'forest',
      accessories: ['cloak-hood', 'travelers-pack'] } },
  { id: 'healer', label: 'Healer', icon: '✨', genre: 'fantasy',
    description: 'Divine conduit of restoration and light',
    defaults: { build: 'average', attire: 'priestly-vestments', weapon: 'holy-symbol',
      expression: 'serene', pose: 'blessing', background: 'temple',
      accessories: ['amulet'] } },
  { id: 'barbarian', label: 'Barbarian', icon: '🪓', genre: 'fantasy',
    description: 'Primal warrior fueled by untamed rage',
    defaults: { build: 'heavy-muscular', attire: 'tribal-furs', weapon: 'greataxe',
      expression: 'fierce', pose: 'battle-cry', background: 'wilderness',
      features: ['war-paint', 'scars'] } },
  { id: 'bard', label: 'Bard', icon: '🎵', genre: 'fantasy',
    description: 'Charismatic performer and silver-tongued storyteller',
    defaults: { build: 'average', attire: 'performer-outfit', weapon: 'rapier',
      expression: 'charming', pose: 'performing', background: 'tavern',
      accessories: ['musical-instrument', 'hat'] } },
  { id: 'necromancer', label: 'Necromancer', icon: '💀', genre: 'fantasy',
    description: 'Dark sorcerer commanding the forces of death',
    defaults: { build: 'gaunt', attire: 'dark-robes', weapon: 'staff-wand',
      expression: 'menacing', pose: 'channeling', background: 'crypt',
      accessories: ['skull-totem'], features: ['glowing-eyes'] } },
  { id: 'noble', label: 'Noble', icon: '👑', genre: 'fantasy',
    description: 'Aristocrat of power and influence',
    defaults: { build: 'average', attire: 'noble-finery', weapon: 'rapier',
      expression: 'proud', pose: 'regal', background: 'throne-room',
      accessories: ['jewelry', 'crown-circlet'] } },
  { id: 'pirate', label: 'Pirate', icon: '🏴‍☠️', genre: 'fantasy',
    description: 'Swashbuckling seafarer and fortune hunter',
    defaults: { build: 'athletic', attire: 'pirate-captain', weapon: 'cutlass',
      expression: 'roguish', pose: 'confident', background: 'ship-deck',
      accessories: ['hat', 'jewelry'], features: ['scars'] } },

  // ── Sci-Fi ──
  { id: 'space-marine', label: 'Space Marine', icon: '🛡️', genre: 'scifi',
    description: 'Power-armored soldier of the far future',
    defaults: { build: 'heavy-muscular', attire: 'power-armor', weapon: 'energy-rifle',
      expression: 'determined', pose: 'combat-ready', background: 'spaceship-interior' } },
  { id: 'pilot', label: 'Star Pilot', icon: '🛸', genre: 'scifi',
    description: 'Ace pilot navigating the stars',
    defaults: { build: 'athletic', attire: 'flight-suit', weapon: 'laser-pistol',
      expression: 'confident', pose: 'relaxed', background: 'spaceship-cockpit',
      accessories: ['helmet-visor'] } },
  { id: 'alien', label: 'Alien', icon: '👽', genre: 'scifi',
    description: 'Non-human being from another world',
    defaults: { species: 'alien-humanoid', attire: 'alien-garments', expression: 'neutral',
      pose: 'standing-proud', background: 'alien-world' } },
  { id: 'scientist-sf', label: 'Scientist', icon: '🔬', genre: 'scifi',
    description: 'Brilliant researcher pushing the boundaries of knowledge',
    defaults: { build: 'lean', attire: 'lab-coat', expression: 'focused',
      pose: 'examining', background: 'laboratory',
      accessories: ['datapad'] } },
  { id: 'bounty-hunter', label: 'Bounty Hunter', icon: '🎯', genre: 'scifi',
    description: 'Relentless tracker hunting across the galaxy',
    defaults: { build: 'athletic', attire: 'tactical-armor', weapon: 'laser-pistol',
      expression: 'vigilant', pose: 'standing-alert', background: 'spaceport',
      accessories: ['helmet-visor', 'bandolier'] } },
  { id: 'android', label: 'Android', icon: '🤖', genre: 'scifi',
    description: 'Synthetic being, indistinguishable from human — or not',
    defaults: { species: 'android', build: 'athletic', attire: 'minimalist-future',
      expression: 'neutral', pose: 'standing-proud', background: 'spaceship-interior',
      features: ['synthetic-skin'] } },

  // ── Cyberpunk ──
  { id: 'street-samurai', label: 'Street Samurai', icon: '⚡', genre: 'cyberpunk',
    description: 'Chrome-enhanced street fighter',
    defaults: { build: 'muscular', attire: 'street-tactical', weapon: 'cyber-blade',
      expression: 'fierce', pose: 'combat-ready', background: 'neon-alley',
      features: ['cybernetic-arm', 'cybernetic-eyes'] } },
  { id: 'netrunner', label: 'Netrunner', icon: '💻', genre: 'cyberpunk',
    description: 'Elite hacker jacking into cyberspace',
    defaults: { build: 'lean', attire: 'tech-wear', expression: 'focused',
      pose: 'seated', background: 'hacker-den',
      features: ['cybernetic-eyes', 'neural-interface'],
      accessories: ['datapad'] } },
  { id: 'corp-exec', label: 'Corp Executive', icon: '💼', genre: 'cyberpunk',
    description: 'Ruthless megacorp power player',
    defaults: { build: 'average', attire: 'corp-suit', expression: 'shrewd',
      pose: 'regal', background: 'corporate-penthouse',
      accessories: ['jewelry'] } },
  { id: 'fixer', label: 'Fixer', icon: '🤝', genre: 'cyberpunk',
    description: 'Connected dealmaker who makes things happen',
    defaults: { build: 'average', attire: 'street-fashion', expression: 'charming',
      pose: 'leaning', background: 'neon-alley',
      accessories: ['jewelry', 'datapad'] } },
  { id: 'nomad', label: 'Nomad', icon: '🏍️', genre: 'cyberpunk',
    description: 'Road warrior from the wastelands outside the city',
    defaults: { build: 'athletic', attire: 'nomad-gear', weapon: 'heavy-pistol',
      expression: 'determined', pose: 'standing-alert', background: 'wasteland-road',
      features: ['scars'], accessories: ['goggles'] } },

  // ── Horror ──
  { id: 'investigator', label: 'Investigator', icon: '🔍', genre: 'horror',
    description: 'Dogged truth-seeker drawn into the unknown',
    defaults: { build: 'average', attire: 'trenchcoat-noir', expression: 'suspicious',
      pose: 'standing-alert', background: 'foggy-street',
      accessories: ['flashlight'] } },
  { id: 'occultist', label: 'Occultist', icon: '🕯️', genre: 'horror',
    description: 'Scholar of forbidden knowledge and dark rites',
    defaults: { build: 'lean', attire: 'dark-robes', expression: 'focused',
      pose: 'channeling', background: 'occult-chamber',
      accessories: ['spell-book', 'amulet'] } },
  { id: 'survivor-h', label: 'Survivor', icon: '🪓', genre: 'horror',
    description: 'Ordinary person pushed to extraordinary limits',
    defaults: { build: 'average', attire: 'casual-worn', expression: 'fearful',
      pose: 'defensive', background: 'abandoned-building',
      features: ['scars'] } },
  { id: 'vampire', label: 'Vampire', icon: '🧛', genre: 'horror',
    description: 'Immortal predator hiding in plain sight',
    defaults: { species: 'vampire', build: 'lean', skin: 'pale', attire: 'gothic-elegant',
      expression: 'menacing', pose: 'regal', background: 'gothic-manor',
      features: ['fangs', 'glowing-eyes'] } },
  { id: 'cultist', label: 'Cultist', icon: '🌀', genre: 'horror',
    description: 'Devoted follower of unspeakable powers',
    defaults: { attire: 'cult-robes', expression: 'unhinged', pose: 'channeling',
      background: 'occult-chamber', features: ['ritual-marks'],
      accessories: ['amulet'] } },

  // ── Modern ──
  { id: 'soldier-m', label: 'Soldier', icon: '🎖️', genre: 'modern',
    description: 'Military operative trained for modern warfare',
    defaults: { build: 'muscular', attire: 'military-fatigues', weapon: 'assault-rifle',
      expression: 'determined', pose: 'combat-ready', background: 'military-base' } },
  { id: 'detective', label: 'Detective', icon: '🔍', genre: 'modern',
    description: 'Sharp-eyed investigator working tough cases',
    defaults: { build: 'average', attire: 'trenchcoat-noir', expression: 'suspicious',
      pose: 'arms-crossed', background: 'city-night',
      accessories: ['badge'] } },
  { id: 'criminal', label: 'Criminal', icon: '🔫', genre: 'modern',
    description: 'Underworld figure operating outside the law',
    defaults: { build: 'athletic', attire: 'street-fashion', weapon: 'heavy-pistol',
      expression: 'menacing', pose: 'confident', background: 'city-night',
      features: ['tattoos'] } },
  { id: 'executive', label: 'Executive', icon: '💼', genre: 'modern',
    description: 'Power player in the corporate world',
    defaults: { build: 'average', attire: 'business-suit', expression: 'proud',
      pose: 'regal', background: 'office-penthouse',
      accessories: ['jewelry'] } },
  { id: 'scientist-m', label: 'Scientist', icon: '🧪', genre: 'modern',
    description: 'Researcher in cutting-edge fields',
    defaults: { build: 'lean', attire: 'lab-coat', expression: 'focused',
      pose: 'examining', background: 'laboratory' } },

  // ── Post-Apocalyptic ──
  { id: 'wastelander', label: 'Wastelander', icon: '☢️', genre: 'postapoc',
    description: 'Hardened survivor of the wasteland',
    defaults: { build: 'athletic', attire: 'wasteland-scavenger', weapon: 'makeshift-weapon',
      expression: 'weary', pose: 'standing-alert', background: 'wasteland',
      features: ['scars'], accessories: ['gas-mask', 'goggles'] } },
  { id: 'raider', label: 'Raider', icon: '💀', genre: 'postapoc',
    description: 'Violent marauder taking what they want',
    defaults: { build: 'muscular', attire: 'raider-punk', weapon: 'makeshift-weapon',
      expression: 'fierce', pose: 'combat-ready', background: 'wasteland-ruins',
      features: ['scars', 'war-paint', 'tattoos'] } },
  { id: 'mutant', label: 'Mutant', icon: '🧬', genre: 'postapoc',
    description: 'Changed by radiation into something new',
    defaults: { species: 'mutant', build: 'heavy-muscular', attire: 'wasteland-scavenger',
      expression: 'menacing', pose: 'standing-proud', background: 'wasteland',
      features: ['mutations', 'scars'] } },
  { id: 'settler', label: 'Settler', icon: '🏚️', genre: 'postapoc',
    description: 'Community builder trying to rebuild civilization',
    defaults: { build: 'average', attire: 'practical-workwear', expression: 'weary',
      pose: 'relaxed', background: 'wasteland-settlement',
      accessories: ['travelers-pack'] } },

  // ── Steampunk ──
  { id: 'inventor', label: 'Inventor', icon: '🔧', genre: 'steampunk',
    description: 'Brilliant tinkerer of clockwork devices',
    defaults: { build: 'lean', attire: 'steampunk-inventor', expression: 'focused',
      pose: 'examining', background: 'steampunk-workshop',
      accessories: ['goggles', 'toolbelt'] } },
  { id: 'airship-captain', label: 'Airship Captain', icon: '🎩', genre: 'steampunk',
    description: 'Dashing commander of a flying vessel',
    defaults: { build: 'athletic', attire: 'steampunk-captain', weapon: 'revolver',
      expression: 'proud', pose: 'confident', background: 'airship-deck',
      accessories: ['goggles', 'hat'] } },
  { id: 'clockwork-knight', label: 'Clockwork Knight', icon: '🛡️', genre: 'steampunk',
    description: 'Steam-powered armored warrior',
    defaults: { build: 'muscular', attire: 'steampunk-armor', weapon: 'sword-shield',
      expression: 'determined', pose: 'combat-ready', background: 'steampunk-city',
      features: ['mechanical-parts'] } },
  { id: 'aristocrat', label: 'Aristocrat', icon: '🎭', genre: 'steampunk',
    description: 'High-society elite of the steam age',
    defaults: { build: 'average', attire: 'steampunk-aristocrat', expression: 'proud',
      pose: 'regal', background: 'victorian-interior',
      accessories: ['jewelry', 'hat', 'monocle'] } },

  // ── Western ──
  { id: 'gunslinger', label: 'Gunslinger', icon: '🔫', genre: 'western',
    description: 'Fastest draw in the frontier',
    defaults: { build: 'lean', attire: 'gunslinger-duster', weapon: 'revolver',
      expression: 'determined', pose: 'standoff', background: 'dusty-town',
      accessories: ['hat'] } },
  { id: 'sheriff', label: 'Sheriff', icon: '⭐', genre: 'western',
    description: 'Lawman keeping order on the frontier',
    defaults: { build: 'athletic', attire: 'lawman-outfit', weapon: 'revolver',
      expression: 'vigilant', pose: 'standing-proud', background: 'dusty-town',
      accessories: ['badge', 'hat'] } },
  { id: 'outlaw', label: 'Outlaw', icon: '🤠', genre: 'western',
    description: 'Wanted fugitive living outside the law',
    defaults: { build: 'athletic', attire: 'outlaw-garb', weapon: 'revolver',
      expression: 'roguish', pose: 'leaning', background: 'canyon',
      features: ['scars'], accessories: ['hat', 'bandolier'] } },
  { id: 'frontier-doc', label: 'Frontier Doctor', icon: '💊', genre: 'western',
    description: 'The only medical help for miles around',
    defaults: { build: 'lean', attire: 'frontier-formal', expression: 'weary',
      pose: 'seated', background: 'saloon',
      accessories: ['travelers-pack'] } },
];

// ─── Trait Definitions ────────────────────────────────────────────────────────
// Options with `genres` array are filtered in the UI to only show in those genres.
// Options without `genres` are universal (shown in all genres).

const TRAITS = {
  // ── Identity (universal) ──
  species: {
    group: 'Identity', label: 'Species / Type', type: 'single', allowCustom: true,
    options: [
      // Universal
      { id: 'human', label: 'Human', prompt: 'human' },
      // Fantasy
      { id: 'elf', label: 'Elf', prompt: 'elf, pointed ears, elegant angular features', genres: ['fantasy'] },
      { id: 'dwarf', label: 'Dwarf', prompt: 'dwarf, short and stout, thick-boned, broad features', genres: ['fantasy'] },
      { id: 'half-elf', label: 'Half-Elf', prompt: 'half-elf, slightly pointed ears, blend of human and elven features', genres: ['fantasy'] },
      { id: 'orc', label: 'Orc', prompt: 'orc, green-gray skin, tusks, strong jaw', genres: ['fantasy'] },
      { id: 'halfling', label: 'Halfling', prompt: 'halfling, very small stature, youthful rounded face, curly hair', genres: ['fantasy'] },
      { id: 'tiefling', label: 'Tiefling', prompt: 'tiefling, small horns on forehead, solid-color eyes, subtly infernal features', genres: ['fantasy'] },
      { id: 'gnome', label: 'Gnome', prompt: 'gnome, very small, large expressive eyes, pointed nose', genres: ['fantasy'] },
      { id: 'dragonborn', label: 'Dragonborn', prompt: 'dragonborn, reptilian humanoid, scales, dragon-like head, no hair', genres: ['fantasy'] },
      { id: 'goblin', label: 'Goblin', prompt: 'goblin, small green-skinned creature, large pointed ears, sharp teeth', genres: ['fantasy'] },
      { id: 'tabaxi', label: 'Tabaxi', prompt: 'tabaxi, feline humanoid, fur-covered, cat-like face and eyes', genres: ['fantasy'] },
      { id: 'aasimar', label: 'Aasimar', prompt: 'aasimar, celestial humanoid, faintly luminous skin, ethereal beauty', genres: ['fantasy'] },
      // Sci-Fi
      { id: 'alien-humanoid', label: 'Alien Humanoid', prompt: 'alien humanoid, non-human skin color, unusual features, otherworldly', genres: ['scifi'] },
      { id: 'alien-exotic', label: 'Exotic Alien', prompt: 'exotic alien species, distinctly non-human features, bizarre anatomy', genres: ['scifi'] },
      { id: 'android', label: 'Android', prompt: 'android, synthetic human, subtle artificial seams and joints, perfect symmetry', genres: ['scifi', 'cyberpunk'] },
      { id: 'cyborg', label: 'Cyborg', prompt: 'cyborg, human with extensive visible mechanical augmentation', genres: ['scifi', 'cyberpunk'] },
      // Horror
      { id: 'vampire', label: 'Vampire', prompt: 'vampire, pale undead, predatory beauty, subtle fangs, blood-red eyes', genres: ['horror'] },
      { id: 'werewolf-hybrid', label: 'Werewolf', prompt: 'werewolf in hybrid form, partially transformed, wolf-like features, furred', genres: ['horror'] },
      { id: 'ghoul', label: 'Ghoul', prompt: 'ghoul, gaunt undead, sunken features, decayed flesh', genres: ['horror'] },
      { id: 'demon', label: 'Demon', prompt: 'demon, infernal creature, horns, unnatural skin, glowing eyes', genres: ['horror', 'fantasy'] },
      // Post-Apoc
      { id: 'mutant', label: 'Mutant', prompt: 'radiation mutant, visibly altered human, unusual growths or features', genres: ['postapoc'] },
    ]
  },
  age: {
    group: 'Identity', label: 'Age', type: 'single',
    options: [
      { id: 'child', label: 'Child', prompt: 'child, young, small' },
      { id: 'teen', label: 'Teen', prompt: 'teenager, adolescent, youthful' },
      { id: 'young-adult', label: 'Young Adult', prompt: 'young adult, early twenties' },
      { id: 'adult', label: 'Adult', prompt: 'adult, mature prime' },
      { id: 'middle-aged', label: 'Middle-Aged', prompt: 'middle-aged, some lines of experience' },
      { id: 'mature', label: 'Mature', prompt: 'mature, weathered, seasoned, gray-streaked' },
      { id: 'elderly', label: 'Elderly', prompt: 'elderly, aged, wrinkled, white-haired' },
    ]
  },
  gender: {
    group: 'Identity', label: 'Gender', type: 'single',
    options: [
      { id: 'male', label: 'Male', prompt: 'male' },
      { id: 'female', label: 'Female', prompt: 'female' },
      { id: 'androgynous', label: 'Androgynous', prompt: 'androgynous, gender-ambiguous features' },
    ]
  },
  ethnicity: {
    group: 'Identity', label: 'Ethnicity', type: 'single',
    options: [
      { id: 'northern-european', label: 'Northern European', prompt: 'Northern European features, fair complexion' },
      { id: 'mediterranean', label: 'Mediterranean', prompt: 'Mediterranean features, olive complexion' },
      { id: 'east-asian', label: 'East Asian', prompt: 'East Asian features' },
      { id: 'south-asian', label: 'South Asian', prompt: 'South Asian features, warm brown complexion' },
      { id: 'middle-eastern', label: 'Middle Eastern', prompt: 'Middle Eastern features' },
      { id: 'east-african', label: 'East African', prompt: 'East African features, dark complexion' },
      { id: 'west-african', label: 'West African', prompt: 'West African features, deep dark complexion' },
      { id: 'native-american', label: 'Native American', prompt: 'Native American features' },
      { id: 'latino', label: 'Latino', prompt: 'Latino features' },
      { id: 'slavic', label: 'Slavic', prompt: 'Slavic features' },
      { id: 'mixed', label: 'Mixed Heritage', prompt: 'mixed heritage, blended ethnic features' },
    ]
  },

  // ── Physique (universal) ──
  build: {
    group: 'Physique', label: 'Build', type: 'single',
    options: [
      { id: 'lean', label: 'Lean', prompt: 'lean, slender build' },
      { id: 'athletic', label: 'Athletic', prompt: 'athletic, toned build' },
      { id: 'muscular', label: 'Muscular', prompt: 'muscular, strong powerful build' },
      { id: 'heavy-muscular', label: 'Heavy Muscular', prompt: 'heavily muscular, massive imposing build' },
      { id: 'average', label: 'Average', prompt: 'average build' },
      { id: 'stocky', label: 'Stocky', prompt: 'stocky, broad compact build' },
      { id: 'gaunt', label: 'Gaunt', prompt: 'gaunt, thin, angular, bony build' },
      { id: 'curvy', label: 'Curvy', prompt: 'curvy, full-figured build' },
      { id: 'heavy', label: 'Heavy-Set', prompt: 'heavy-set, large bulky build' },
    ]
  },
  height: {
    group: 'Physique', label: 'Height', type: 'single',
    options: [
      { id: 'very-short', label: 'Very Short', prompt: 'very short stature' },
      { id: 'short', label: 'Short', prompt: 'short stature' },
      { id: 'average', label: 'Average', prompt: 'average height' },
      { id: 'tall', label: 'Tall', prompt: 'tall stature' },
      { id: 'very-tall', label: 'Very Tall', prompt: 'very tall, towering stature' },
    ]
  },
  skin: {
    group: 'Physique', label: 'Skin', type: 'single',
    options: [
      { id: 'pale', label: 'Pale', prompt: 'pale skin' },
      { id: 'fair', label: 'Fair', prompt: 'fair skin' },
      { id: 'tan', label: 'Tan', prompt: 'tan skin' },
      { id: 'olive', label: 'Olive', prompt: 'olive skin' },
      { id: 'brown', label: 'Brown', prompt: 'brown skin' },
      { id: 'dark', label: 'Dark', prompt: 'dark skin' },
      { id: 'weathered', label: 'Weathered', prompt: 'weathered, rough, sun-damaged skin' },
      { id: 'freckled', label: 'Freckled', prompt: 'freckled skin' },
    ]
  },

  // ── Face & Hair (mostly universal) ──
  eye_color: {
    group: 'Face & Hair', label: 'Eyes', type: 'single',
    options: [
      { id: 'brown', label: 'Brown', prompt: 'brown eyes' },
      { id: 'hazel', label: 'Hazel', prompt: 'hazel eyes' },
      { id: 'blue', label: 'Blue', prompt: 'blue eyes' },
      { id: 'green', label: 'Green', prompt: 'green eyes' },
      { id: 'gray', label: 'Gray', prompt: 'gray eyes' },
      { id: 'amber', label: 'Amber', prompt: 'amber golden eyes' },
      { id: 'violet', label: 'Violet', prompt: 'violet purple eyes', genres: ['fantasy', 'scifi', 'horror'] },
      { id: 'silver', label: 'Silver', prompt: 'silver metallic eyes', genres: ['fantasy', 'scifi'] },
      { id: 'red', label: 'Red', prompt: 'red glowing eyes, supernatural', genres: ['fantasy', 'horror', 'cyberpunk'] },
      { id: 'heterochromia', label: 'Heterochromia', prompt: 'heterochromia, two different colored eyes' },
      { id: 'cybernetic-eyes', label: 'Cybernetic', prompt: 'glowing cybernetic eyes, LED iris', genres: ['cyberpunk', 'scifi'] },
      { id: 'all-black', label: 'All Black', prompt: 'entirely black eyes, no visible iris, alien', genres: ['horror', 'scifi'] },
    ]
  },
  hair_style: {
    group: 'Face & Hair', label: 'Hair Style', type: 'single',
    options: [
      { id: 'bald', label: 'Bald', prompt: 'bald, shaved head' },
      { id: 'buzzcut', label: 'Buzzcut', prompt: 'buzzcut, very short hair' },
      { id: 'short', label: 'Short', prompt: 'short hair' },
      { id: 'medium', label: 'Medium', prompt: 'medium-length hair' },
      { id: 'long', label: 'Long', prompt: 'long hair' },
      { id: 'very-long', label: 'Very Long', prompt: 'very long flowing hair' },
      { id: 'curly-short', label: 'Short Curly', prompt: 'short curly hair' },
      { id: 'curly-long', label: 'Long Curly', prompt: 'long curly voluminous hair' },
      { id: 'dreadlocks', label: 'Dreadlocks', prompt: 'dreadlocks' },
      { id: 'braided', label: 'Braided', prompt: 'intricately braided hair' },
      { id: 'mohawk', label: 'Mohawk', prompt: 'mohawk hairstyle' },
      { id: 'ponytail', label: 'Ponytail', prompt: 'hair pulled back in a ponytail' },
      { id: 'topknot', label: 'Topknot', prompt: 'topknot, hair tied up on top' },
      { id: 'wild', label: 'Wild', prompt: 'wild unkempt untamed hair' },
      { id: 'slicked-back', label: 'Slicked Back', prompt: 'slicked back hair, sharp and controlled' },
      { id: 'undercut', label: 'Undercut', prompt: 'undercut hairstyle, shaved sides' },
    ]
  },
  hair_color: {
    group: 'Face & Hair', label: 'Hair Color', type: 'single',
    options: [
      { id: 'black', label: 'Black', prompt: 'black hair' },
      { id: 'dark-brown', label: 'Dark Brown', prompt: 'dark brown hair' },
      { id: 'brown', label: 'Brown', prompt: 'brown hair' },
      { id: 'auburn', label: 'Auburn', prompt: 'auburn reddish-brown hair' },
      { id: 'red', label: 'Red', prompt: 'red ginger hair' },
      { id: 'blonde', label: 'Blonde', prompt: 'blonde hair' },
      { id: 'platinum', label: 'Platinum', prompt: 'platinum white-blonde hair' },
      { id: 'gray', label: 'Gray', prompt: 'gray silver hair' },
      { id: 'white', label: 'White', prompt: 'pure white hair' },
      { id: 'neon-blue', label: 'Neon Blue', prompt: 'vivid neon blue hair', genres: ['fantasy', 'cyberpunk', 'scifi'] },
      { id: 'neon-purple', label: 'Neon Purple', prompt: 'deep purple hair', genres: ['fantasy', 'cyberpunk', 'scifi'] },
      { id: 'neon-green', label: 'Neon Green', prompt: 'bright neon green hair', genres: ['cyberpunk', 'scifi'] },
      { id: 'neon-pink', label: 'Neon Pink', prompt: 'hot neon pink hair', genres: ['cyberpunk'] },
      { id: 'multicolor', label: 'Multicolor', prompt: 'multicolored dyed hair, streaks of different colors', genres: ['fantasy', 'cyberpunk', 'modern'] },
    ]
  },
  facial_hair: {
    group: 'Face & Hair', label: 'Facial Hair', type: 'single',
    options: [
      { id: 'none', label: 'None', prompt: 'clean-shaven' },
      { id: 'stubble', label: 'Stubble', prompt: 'light stubble, five o\'clock shadow' },
      { id: 'mustache', label: 'Mustache', prompt: 'mustache' },
      { id: 'goatee', label: 'Goatee', prompt: 'goatee' },
      { id: 'short-beard', label: 'Short Beard', prompt: 'short trimmed beard' },
      { id: 'full-beard', label: 'Full Beard', prompt: 'full thick beard' },
      { id: 'long-beard', label: 'Long Beard', prompt: 'long flowing beard' },
      { id: 'braided-beard', label: 'Braided Beard', prompt: 'braided beard with ornaments' },
      { id: 'handlebar', label: 'Handlebar', prompt: 'handlebar mustache, curled ends' },
      { id: 'mutton-chops', label: 'Mutton Chops', prompt: 'mutton chop sideburns' },
    ]
  },

  // ── Distinctive Features (multi-select, genre-mixed) ──
  features: {
    group: 'Marks & Features', label: 'Distinctive Features', type: 'multi', allowCustom: true,
    options: [
      // Universal
      { id: 'facial-scar', label: 'Facial Scar', prompt: 'prominent facial scar' },
      { id: 'scars', label: 'Body Scars', prompt: 'visible battle scars on body' },
      { id: 'tattoos', label: 'Tattoos', prompt: 'visible tattoos' },
      { id: 'piercings', label: 'Piercings', prompt: 'facial piercings' },
      { id: 'eye-patch', label: 'Eye Patch', prompt: 'wearing an eye patch' },
      { id: 'freckles', label: 'Freckles', prompt: 'prominent freckles across face' },
      { id: 'birthmark', label: 'Birthmark', prompt: 'distinctive birthmark on face' },
      { id: 'vitiligo', label: 'Vitiligo', prompt: 'patches of vitiligo on skin' },
      { id: 'missing-limb', label: 'Missing Limb', prompt: 'missing one arm or hand' },
      // Fantasy
      { id: 'war-paint', label: 'War Paint', prompt: 'face and body decorated with war paint', genres: ['fantasy', 'postapoc', 'western'] },
      { id: 'glowing-eyes', label: 'Glowing Eyes', prompt: 'eyes that glow with supernatural energy', genres: ['fantasy', 'horror', 'scifi'] },
      { id: 'horns', label: 'Horns', prompt: 'prominent horns growing from head', genres: ['fantasy', 'horror'] },
      { id: 'pointed-ears', label: 'Pointed Ears', prompt: 'distinctly pointed ears', genres: ['fantasy'] },
      { id: 'fangs', label: 'Fangs', prompt: 'visible fangs or sharp teeth', genres: ['fantasy', 'horror'] },
      { id: 'tribal-tattoos', label: 'Tribal Tattoos', prompt: 'tribal pattern tattoos covering skin', genres: ['fantasy', 'postapoc'] },
      { id: 'runic-markings', label: 'Runic Markings', prompt: 'glowing runic markings on skin', genres: ['fantasy'] },
      // Cyberpunk / Sci-Fi
      { id: 'cybernetic-arm', label: 'Cybernetic Arm', prompt: 'mechanical cybernetic arm, chrome and carbon fiber', genres: ['cyberpunk', 'scifi'] },
      { id: 'cybernetic-eyes', label: 'Cyber Eyes', prompt: 'cybernetic eye implants, glowing LED irises', genres: ['cyberpunk', 'scifi'] },
      { id: 'neural-interface', label: 'Neural Interface', prompt: 'visible neural interface port on temple or neck', genres: ['cyberpunk', 'scifi'] },
      { id: 'synthetic-skin', label: 'Synthetic Skin', prompt: 'patches of synthetic skin revealing circuitry underneath', genres: ['cyberpunk', 'scifi'] },
      { id: 'led-tattoos', label: 'LED Tattoos', prompt: 'glowing LED circuit-pattern tattoos under skin', genres: ['cyberpunk'] },
      { id: 'subdermal-plating', label: 'Subdermal Plating', prompt: 'visible armored plating beneath skin', genres: ['cyberpunk', 'scifi'] },
      // Horror
      { id: 'ritual-marks', label: 'Ritual Marks', prompt: 'occult ritual markings carved or tattooed on skin', genres: ['horror'] },
      { id: 'unnatural-pallor', label: 'Unnatural Pallor', prompt: 'unnaturally pale, corpse-like complexion', genres: ['horror'] },
      { id: 'third-eye', label: 'Third Eye', prompt: 'a third eye on forehead, partially open', genres: ['horror', 'fantasy'] },
      { id: 'veins-visible', label: 'Visible Veins', prompt: 'dark veins visible beneath translucent skin', genres: ['horror'] },
      // Post-Apoc
      { id: 'mutations', label: 'Mutations', prompt: 'visible radiation mutations, unusual growths', genres: ['postapoc'] },
      { id: 'radiation-burns', label: 'Radiation Burns', prompt: 'radiation burn scars, discolored patchy skin', genres: ['postapoc'] },
      // Steampunk
      { id: 'mechanical-parts', label: 'Mechanical Parts', prompt: 'visible clockwork mechanical body parts, brass and gears', genres: ['steampunk'] },
      { id: 'steam-burns', label: 'Steam Burns', prompt: 'old steam burn scars on hands and arms', genres: ['steampunk'] },
    ]
  },

  // ── Attire (heavily genre-specific) ──
  attire: {
    group: 'Attire & Gear', label: 'Clothing', type: 'single', allowCustom: true,
    options: [
      // Universal
      { id: 'casual-worn', label: 'Casual / Worn', prompt: 'wearing worn casual clothes, everyday outfit' },
      { id: 'practical-workwear', label: 'Practical Workwear', prompt: 'wearing practical durable work clothes' },
      // Fantasy
      { id: 'plate-armor', label: 'Plate Armor', prompt: 'wearing full plate armor, heavy metal armor', genres: ['fantasy'] },
      { id: 'chain-mail', label: 'Chain Mail', prompt: 'wearing chain mail armor', genres: ['fantasy'] },
      { id: 'leather-armor', label: 'Leather Armor', prompt: 'wearing studded leather armor', genres: ['fantasy'] },
      { id: 'leather-dark', label: 'Dark Leather', prompt: 'wearing dark leather outfit, assassin-like', genres: ['fantasy', 'modern'] },
      { id: 'mage-robes', label: 'Mage Robes', prompt: 'wearing ornate mage robes with arcane symbols', genres: ['fantasy'] },
      { id: 'dark-robes', label: 'Dark Robes', prompt: 'wearing dark tattered robes, ominous', genres: ['fantasy', 'horror'] },
      { id: 'monastic-robes', label: 'Monastic Robes', prompt: 'wearing simple monastic robes, martial artist', genres: ['fantasy'] },
      { id: 'priestly-vestments', label: 'Priestly Vestments', prompt: 'wearing priestly vestments, holy garments', genres: ['fantasy'] },
      { id: 'noble-finery', label: 'Noble Finery', prompt: 'wearing lavish noble clothing, silk and velvet, ornate', genres: ['fantasy', 'steampunk'] },
      { id: 'ranger-garb', label: 'Ranger Garb', prompt: 'wearing ranger outfit, green and brown woodland attire', genres: ['fantasy'] },
      { id: 'tribal-furs', label: 'Tribal Furs', prompt: 'wearing tribal furs and animal hides, barbaric', genres: ['fantasy', 'postapoc'] },
      { id: 'pirate-captain', label: 'Pirate Captain', prompt: 'wearing pirate captain outfit, tricorn hat, long coat', genres: ['fantasy'] },
      { id: 'performer-outfit', label: 'Performer Outfit', prompt: 'wearing flamboyant colorful performer clothing', genres: ['fantasy', 'modern'] },
      { id: 'peasant-simple', label: 'Peasant Clothes', prompt: 'wearing simple peasant clothing, rough-spun', genres: ['fantasy', 'western'] },
      { id: 'samurai-armor', label: 'Samurai Armor', prompt: 'wearing ornate samurai armor, layered plates', genres: ['fantasy'] },
      // Sci-Fi
      { id: 'flight-suit', label: 'Flight Suit', prompt: 'wearing a futuristic flight suit, pilot gear', genres: ['scifi'] },
      { id: 'power-armor', label: 'Power Armor', prompt: 'wearing heavy futuristic power armor, high-tech plate', genres: ['scifi'] },
      { id: 'tactical-armor', label: 'Tactical Armor', prompt: 'wearing modular tactical combat armor, military sci-fi', genres: ['scifi', 'cyberpunk'] },
      { id: 'minimalist-future', label: 'Minimalist Future', prompt: 'wearing sleek minimalist futuristic clothing, clean lines', genres: ['scifi'] },
      { id: 'alien-garments', label: 'Alien Garments', prompt: 'wearing alien garments, non-human design and materials', genres: ['scifi'] },
      { id: 'lab-coat', label: 'Lab Coat', prompt: 'wearing a lab coat over professional clothes', genres: ['scifi', 'modern', 'horror'] },
      { id: 'space-suit', label: 'Space Suit', prompt: 'wearing a space suit, EVA suit, helmet off', genres: ['scifi'] },
      // Cyberpunk
      { id: 'street-tactical', label: 'Street Tactical', prompt: 'wearing urban tactical gear, kevlar vest, combat boots, street-ready', genres: ['cyberpunk'] },
      { id: 'tech-wear', label: 'Tech Wear', prompt: 'wearing techwear, waterproof fabrics, utility straps, LED accents', genres: ['cyberpunk'] },
      { id: 'corp-suit', label: 'Corp Suit', prompt: 'wearing expensive corporate suit, impeccable, high-end futuristic fashion', genres: ['cyberpunk'] },
      { id: 'street-fashion', label: 'Street Fashion', prompt: 'wearing bold street fashion, neon colors, mixed styles', genres: ['cyberpunk', 'modern'] },
      { id: 'nomad-gear', label: 'Nomad Gear', prompt: 'wearing nomad road warrior gear, mix of tech and scavenged parts', genres: ['cyberpunk', 'postapoc'] },
      { id: 'synth-leather', label: 'Synth Leather', prompt: 'wearing synthetic leather jacket and pants, punk aesthetic', genres: ['cyberpunk'] },
      // Horror
      { id: 'gothic-elegant', label: 'Gothic Elegant', prompt: 'wearing gothic elegant clothing, black velvet, Victorian dark fashion', genres: ['horror'] },
      { id: 'cult-robes', label: 'Cult Robes', prompt: 'wearing hooded cult robes, ritual symbols embroidered', genres: ['horror'] },
      { id: 'trenchcoat-noir', label: 'Trenchcoat', prompt: 'wearing a long trenchcoat, noir detective look', genres: ['horror', 'modern'] },
      { id: 'asylum-gown', label: 'Asylum Gown', prompt: 'wearing tattered hospital gown, institutional', genres: ['horror'] },
      // Modern
      { id: 'business-suit', label: 'Business Suit', prompt: 'wearing a tailored business suit, professional', genres: ['modern'] },
      { id: 'military-fatigues', label: 'Military Fatigues', prompt: 'wearing modern military combat fatigues, tactical vest', genres: ['modern'] },
      { id: 'police-uniform', label: 'Police Uniform', prompt: 'wearing police officer uniform', genres: ['modern'] },
      { id: 'athletic-wear', label: 'Athletic Wear', prompt: 'wearing athletic sportswear, modern activewear', genres: ['modern'] },
      { id: 'biker-leather', label: 'Biker Leather', prompt: 'wearing biker leather jacket, boots, rebellious look', genres: ['modern', 'cyberpunk'] },
      // Post-Apoc
      { id: 'wasteland-scavenger', label: 'Wasteland Scavenger', prompt: 'wearing cobbled-together wasteland gear, scavenged materials, repaired and patched', genres: ['postapoc'] },
      { id: 'raider-punk', label: 'Raider Punk', prompt: 'wearing spiked raider gear, intimidating post-apocalyptic punk attire, bones and trophies', genres: ['postapoc'] },
      { id: 'hazmat-modified', label: 'Modified Hazmat', prompt: 'wearing modified hazmat suit, patched and customized for wasteland', genres: ['postapoc'] },
      // Steampunk
      { id: 'steampunk-inventor', label: 'Inventor Garb', prompt: 'wearing steampunk inventor clothing, leather apron, brass goggles, tool-laden', genres: ['steampunk'] },
      { id: 'steampunk-captain', label: 'Airship Captain', prompt: 'wearing steampunk airship captain uniform, brass buttons, long coat', genres: ['steampunk'] },
      { id: 'steampunk-armor', label: 'Clockwork Armor', prompt: 'wearing steam-powered clockwork armor, brass plates, visible gears', genres: ['steampunk'] },
      { id: 'steampunk-aristocrat', label: 'Steam Aristocrat', prompt: 'wearing opulent Victorian-steampunk attire, top hat, cravat, pocket watch', genres: ['steampunk'] },
      // Western
      { id: 'gunslinger-duster', label: 'Gunslinger Duster', prompt: 'wearing long duster coat, cowboy boots, gun belt', genres: ['western'] },
      { id: 'lawman-outfit', label: 'Lawman Outfit', prompt: 'wearing frontier lawman outfit, vest, star badge, clean presentation', genres: ['western'] },
      { id: 'outlaw-garb', label: 'Outlaw Garb', prompt: 'wearing rugged outlaw clothing, bandana, worn leather, road-dusted', genres: ['western'] },
      { id: 'frontier-formal', label: 'Frontier Formal', prompt: 'wearing frontier-era formal clothes, waistcoat, rolled sleeves', genres: ['western'] },
      { id: 'native-attire', label: 'Native Attire', prompt: 'wearing Native American-inspired traditional clothing, beadwork, leather', genres: ['western'] },
    ]
  },
  weapon: {
    group: 'Attire & Gear', label: 'Weapon', type: 'single', allowCustom: true,
    options: [
      // Universal
      { id: 'none', label: 'None / Unarmed', prompt: 'unarmed' },
      { id: 'knife', label: 'Knife', prompt: 'carrying a knife' },
      // Fantasy
      { id: 'sword-shield', label: 'Sword & Shield', prompt: 'carrying a sword and shield', genres: ['fantasy'] },
      { id: 'greatsword', label: 'Greatsword', prompt: 'wielding a massive two-handed greatsword', genres: ['fantasy'] },
      { id: 'rapier', label: 'Rapier', prompt: 'carrying an elegant rapier', genres: ['fantasy', 'steampunk'] },
      { id: 'daggers', label: 'Daggers', prompt: 'wielding daggers, concealed blades', genres: ['fantasy'] },
      { id: 'bow-quiver', label: 'Bow & Quiver', prompt: 'carrying a bow with a quiver of arrows', genres: ['fantasy'] },
      { id: 'crossbow', label: 'Crossbow', prompt: 'holding a crossbow', genres: ['fantasy', 'steampunk'] },
      { id: 'staff-wand', label: 'Staff / Wand', prompt: 'holding an ornate magical staff or wand', genres: ['fantasy'] },
      { id: 'greataxe', label: 'Greataxe', prompt: 'wielding a massive battle axe', genres: ['fantasy'] },
      { id: 'mace-hammer', label: 'Mace / Hammer', prompt: 'carrying a war mace or warhammer', genres: ['fantasy'] },
      { id: 'spear-halberd', label: 'Spear / Halberd', prompt: 'carrying a long spear or halberd', genres: ['fantasy'] },
      { id: 'cutlass', label: 'Cutlass', prompt: 'wielding a curved cutlass sword', genres: ['fantasy'] },
      { id: 'katana', label: 'Katana', prompt: 'carrying a katana, Japanese sword', genres: ['fantasy', 'cyberpunk'] },
      { id: 'holy-symbol', label: 'Holy Symbol', prompt: 'holding aloft a glowing holy symbol', genres: ['fantasy'] },
      { id: 'dual-swords', label: 'Dual Swords', prompt: 'dual-wielding two swords', genres: ['fantasy'] },
      // Firearms (modern, cyberpunk, western, post-apoc)
      { id: 'heavy-pistol', label: 'Pistol', prompt: 'carrying a heavy pistol, holstered at hip', genres: ['modern', 'cyberpunk', 'postapoc', 'horror'] },
      { id: 'revolver', label: 'Revolver', prompt: 'carrying a revolver, six-shooter', genres: ['western', 'steampunk', 'modern'] },
      { id: 'shotgun', label: 'Shotgun', prompt: 'carrying a shotgun, pump-action', genres: ['modern', 'postapoc', 'horror', 'western'] },
      { id: 'assault-rifle', label: 'Assault Rifle', prompt: 'carrying an assault rifle, modern military weapon', genres: ['modern'] },
      { id: 'sniper-rifle', label: 'Sniper Rifle', prompt: 'carrying a sniper rifle, scoped long-range weapon', genres: ['modern', 'scifi'] },
      // Sci-Fi
      { id: 'laser-pistol', label: 'Laser Pistol', prompt: 'carrying a sleek laser pistol, sci-fi sidearm', genres: ['scifi'] },
      { id: 'energy-rifle', label: 'Energy Rifle', prompt: 'carrying an energy rifle, glowing power cell', genres: ['scifi'] },
      { id: 'plasma-cannon', label: 'Plasma Cannon', prompt: 'wielding a heavy plasma cannon, shoulder-mounted', genres: ['scifi'] },
      // Cyberpunk
      { id: 'smart-gun', label: 'Smart Gun', prompt: 'carrying a smart gun with targeting HUD link', genres: ['cyberpunk'] },
      { id: 'cyber-blade', label: 'Cyber Blade', prompt: 'retractable cybernetic arm blade, mantis-like', genres: ['cyberpunk'] },
      { id: 'tech-shotgun', label: 'Tech Shotgun', prompt: 'carrying a modified tech shotgun, neon-accented', genres: ['cyberpunk'] },
      // Post-Apoc
      { id: 'makeshift-weapon', label: 'Makeshift Weapon', prompt: 'carrying a crude makeshift weapon, improvised from scrap', genres: ['postapoc'] },
      // Steampunk
      { id: 'steam-pistol', label: 'Steam Pistol', prompt: 'carrying a brass steam-powered pistol, ornate clockwork mechanism', genres: ['steampunk'] },
      { id: 'tesla-weapon', label: 'Tesla Weapon', prompt: 'wielding an electrical tesla weapon, arcing energy', genres: ['steampunk'] },
      // Western
      { id: 'lever-action', label: 'Lever-Action Rifle', prompt: 'carrying a lever-action rifle, Winchester-style', genres: ['western'] },
      { id: 'lasso', label: 'Lasso', prompt: 'carrying a lasso, rope coiled at hip', genres: ['western'] },
    ]
  },
  accessories: {
    group: 'Attire & Gear', label: 'Accessories', type: 'multi', allowCustom: true,
    options: [
      // Universal
      { id: 'hat', label: 'Hat / Headwear', prompt: 'wearing distinctive headwear' },
      { id: 'jewelry', label: 'Jewelry', prompt: 'wearing ornate jewelry, rings and chains' },
      { id: 'travelers-pack', label: "Traveler's Pack", prompt: 'carrying a traveler backpack and supplies' },
      { id: 'bandolier', label: 'Bandolier', prompt: 'wearing a bandolier of ammunition or supplies' },
      { id: 'goggles', label: 'Goggles', prompt: 'wearing goggles on forehead' },
      { id: 'smoking-pipe', label: 'Pipe', prompt: 'smoking a pipe' },
      // Fantasy
      { id: 'cloak-hood', label: 'Cloak & Hood', prompt: 'wearing a cloak with hood', genres: ['fantasy', 'horror'] },
      { id: 'spell-book', label: 'Spell Book', prompt: 'carrying an ancient spell book', genres: ['fantasy'] },
      { id: 'amulet', label: 'Amulet', prompt: 'wearing a prominent magical amulet', genres: ['fantasy', 'horror'] },
      { id: 'crown-circlet', label: 'Crown / Circlet', prompt: 'wearing a crown or circlet', genres: ['fantasy'] },
      { id: 'musical-instrument', label: 'Musical Instrument', prompt: 'carrying a lute or musical instrument', genres: ['fantasy', 'modern'] },
      { id: 'skull-totem', label: 'Skull Totem', prompt: 'carrying a skull totem or bone ornament', genres: ['fantasy', 'horror', 'postapoc'] },
      { id: 'shield-back', label: 'Shield on Back', prompt: 'shield strapped to back', genres: ['fantasy'] },
      { id: 'gauntlets', label: 'Gauntlets', prompt: 'wearing heavy gauntlets', genres: ['fantasy', 'steampunk'] },
      // Modern / Cyberpunk / Sci-Fi
      { id: 'badge', label: 'Badge / ID', prompt: 'wearing a visible badge or ID card', genres: ['modern', 'scifi'] },
      { id: 'earpiece', label: 'Earpiece / Comm', prompt: 'wearing a communication earpiece', genres: ['modern', 'cyberpunk', 'scifi'] },
      { id: 'sunglasses', label: 'Sunglasses', prompt: 'wearing dark sunglasses', genres: ['modern', 'cyberpunk'] },
      { id: 'datapad', label: 'Datapad / Tablet', prompt: 'carrying a datapad or holographic tablet', genres: ['scifi', 'cyberpunk'] },
      { id: 'helmet-visor', label: 'Helmet / Visor', prompt: 'wearing a high-tech helmet or visor, retracted', genres: ['scifi', 'cyberpunk'] },
      { id: 'holo-display', label: 'Holo Display', prompt: 'holographic display floating near arm or wrist', genres: ['scifi', 'cyberpunk'] },
      // Horror
      { id: 'flashlight', label: 'Flashlight', prompt: 'holding a flashlight, beam cutting through darkness', genres: ['horror', 'modern'] },
      { id: 'holy-water', label: 'Holy Water', prompt: 'carrying a vial of holy water', genres: ['horror'] },
      { id: 'occult-tome', label: 'Occult Tome', prompt: 'carrying an ancient occult tome, leather-bound', genres: ['horror'] },
      // Post-Apoc
      { id: 'gas-mask', label: 'Gas Mask', prompt: 'wearing a gas mask, pushed up on forehead', genres: ['postapoc', 'cyberpunk'] },
      { id: 'scavenged-tech', label: 'Scavenged Tech', prompt: 'carrying scavenged pre-war technology, jury-rigged', genres: ['postapoc'] },
      // Steampunk
      { id: 'monocle', label: 'Monocle', prompt: 'wearing a monocle with brass chain', genres: ['steampunk'] },
      { id: 'toolbelt', label: 'Tool Belt', prompt: 'wearing a tool belt with wrenches and gears', genres: ['steampunk'] },
      { id: 'pocket-watch', label: 'Pocket Watch', prompt: 'carrying an ornate pocket watch on chain', genres: ['steampunk', 'western'] },
      // Western
      { id: 'spurs', label: 'Spurs', prompt: 'wearing boots with spurs', genres: ['western'] },
      { id: 'bolo-tie', label: 'Bolo Tie', prompt: 'wearing a bolo tie', genres: ['western'] },
    ]
  },

  // ── Expression & Pose (mostly universal) ──
  expression: {
    group: 'Expression & Pose', label: 'Expression', type: 'single',
    options: [
      { id: 'neutral', label: 'Neutral', prompt: 'neutral expression' },
      { id: 'determined', label: 'Determined', prompt: 'determined, resolute expression' },
      { id: 'fierce', label: 'Fierce', prompt: 'fierce, aggressive expression' },
      { id: 'serene', label: 'Serene', prompt: 'serene, peaceful expression' },
      { id: 'sly', label: 'Sly', prompt: 'sly, cunning smirk' },
      { id: 'menacing', label: 'Menacing', prompt: 'menacing, threatening expression' },
      { id: 'wise', label: 'Wise', prompt: 'wise, knowing expression' },
      { id: 'weary', label: 'Weary', prompt: 'weary, tired, worn expression' },
      { id: 'joyful', label: 'Joyful', prompt: 'joyful, warm, laughing expression' },
      { id: 'suspicious', label: 'Suspicious', prompt: 'suspicious, distrustful expression' },
      { id: 'proud', label: 'Proud', prompt: 'proud, confident, regal expression' },
      { id: 'charming', label: 'Charming', prompt: 'charming, charismatic, winning smile' },
      { id: 'focused', label: 'Focused', prompt: 'intense focus, concentration' },
      { id: 'vigilant', label: 'Vigilant', prompt: 'vigilant, alert, watchful expression' },
      { id: 'shrewd', label: 'Shrewd', prompt: 'shrewd, calculating, appraising look' },
      { id: 'calm', label: 'Calm', prompt: 'calm, centered, meditative expression' },
      { id: 'roguish', label: 'Roguish', prompt: 'roguish grin, mischievous, devil-may-care' },
      { id: 'fearful', label: 'Fearful', prompt: 'fearful, wide-eyed, terrified expression' },
      { id: 'unhinged', label: 'Unhinged', prompt: 'unhinged, manic, wild-eyed expression' },
      { id: 'cold', label: 'Cold', prompt: 'cold, emotionless, detached expression' },
      { id: 'confident', label: 'Confident', prompt: 'confident, self-assured expression' },
    ]
  },
  pose: {
    group: 'Expression & Pose', label: 'Pose', type: 'single',
    options: [
      { id: 'standing-proud', label: 'Standing Proud', prompt: 'standing tall and proud' },
      { id: 'combat-ready', label: 'Combat Ready', prompt: 'in combat stance, weapon ready' },
      { id: 'arms-crossed', label: 'Arms Crossed', prompt: 'arms crossed, confident stance' },
      { id: 'relaxed', label: 'Relaxed', prompt: 'relaxed, casual pose' },
      { id: 'seated', label: 'Seated', prompt: 'seated, sitting pose' },
      { id: 'leaning', label: 'Leaning', prompt: 'leaning against wall or object' },
      { id: 'walking', label: 'Walking', prompt: 'walking forward, in motion' },
      { id: 'confident', label: 'Confident', prompt: 'confident stance, one hand on hip' },
      { id: 'standing-alert', label: 'Standing Alert', prompt: 'standing alert, scanning surroundings' },
      { id: 'defensive', label: 'Defensive', prompt: 'defensive stance, guarded, wary' },
      { id: 'examining', label: 'Examining', prompt: 'examining something closely, scientific or curious pose' },
      // Fantasy
      { id: 'casting', label: 'Casting Spell', prompt: 'casting a spell, hands glowing with magic', genres: ['fantasy'] },
      { id: 'channeling', label: 'Channeling Power', prompt: 'channeling dark energy, power radiating', genres: ['fantasy', 'horror'] },
      { id: 'battle-cry', label: 'Battle Cry', prompt: 'mid battle cry, weapon raised high', genres: ['fantasy'] },
      { id: 'lurking', label: 'Lurking', prompt: 'lurking in shadows, stealthy', genres: ['fantasy', 'horror', 'cyberpunk'] },
      { id: 'blessing', label: 'Blessing', prompt: 'hands raised in blessing or prayer', genres: ['fantasy', 'horror'] },
      { id: 'regal', label: 'Regal', prompt: 'regal commanding pose, hand on throne or scepter', genres: ['fantasy', 'steampunk'] },
      { id: 'performing', label: 'Performing', prompt: 'performing, mid-song or storytelling', genres: ['fantasy', 'modern'] },
      { id: 'displaying-wares', label: 'Displaying Wares', prompt: 'displaying goods or wares, merchant pose', genres: ['fantasy', 'western', 'steampunk'] },
      { id: 'martial-stance', label: 'Martial Stance', prompt: 'martial arts fighting stance', genres: ['fantasy', 'modern', 'cyberpunk'] },
      // Western
      { id: 'standoff', label: 'Standoff', prompt: 'western standoff pose, hand hovering over holstered gun', genres: ['western'] },
      // Cyberpunk / Sci-Fi
      { id: 'hacking', label: 'Hacking', prompt: 'interfacing with computer terminal, hacking pose', genres: ['cyberpunk', 'scifi'] },
      { id: 'aiming', label: 'Aiming', prompt: 'aiming a weapon, tactical shooting stance', genres: ['modern', 'cyberpunk', 'scifi', 'western'] },
    ]
  },

  // ── Presentation (universal + some genre tags) ──
  shot: {
    group: 'Presentation', label: 'Shot', type: 'single',
    options: [
      { id: 'portrait', label: 'Portrait', prompt: 'portrait shot, head and shoulders' },
      { id: 'bust', label: 'Bust Shot', prompt: 'bust shot, head to chest' },
      { id: 'three-quarter', label: '3/4 Body', prompt: 'three-quarter body shot' },
      { id: 'full-body', label: 'Full Body', prompt: 'full body shot, head to toe' },
      { id: 'close-up', label: 'Close-Up', prompt: 'close-up face shot, detailed' },
      { id: 'dramatic-angle', label: 'Dramatic Angle', prompt: 'dramatic low angle shot, looking up heroically' },
    ]
  },
  art_style: {
    group: 'Presentation', label: 'Art Style', type: 'single',
    options: [
      { id: 'photorealistic', label: 'Photorealistic', prompt: 'photorealistic, hyper-detailed, 8k' },
      { id: 'oil-painting', label: 'Oil Painting', prompt: 'oil painting style, rich brushstrokes, classical' },
      { id: 'concept-art', label: 'Concept Art', prompt: 'concept art style, professional game art' },
      { id: 'watercolor', label: 'Watercolor', prompt: 'watercolor painting, soft edges, flowing colors' },
      { id: 'comic-book', label: 'Comic Book', prompt: 'comic book style, bold lines, cel-shaded' },
      { id: 'charcoal', label: 'Charcoal Sketch', prompt: 'charcoal sketch, dramatic black and white, textured' },
      { id: 'art-nouveau', label: 'Art Nouveau', prompt: 'art nouveau style, ornamental, flowing lines' },
      { id: 'dark-fantasy', label: 'Dark / Gritty', prompt: 'dark gritty realism, atmospheric, moody' },
      { id: 'anime', label: 'Anime / Manga', prompt: 'anime style, Japanese manga illustration' },
      { id: 'pixel-art', label: 'Pixel Art', prompt: 'pixel art style, retro game aesthetic' },
      { id: 'stained-glass', label: 'Stained Glass', prompt: 'stained glass window style, luminous' },
      { id: 'ink-wash', label: 'Ink Wash', prompt: 'ink wash painting, sumi-e style, minimalist' },
      { id: 'noir', label: 'Film Noir', prompt: 'film noir style, high contrast black and white, dramatic shadows' },
      { id: 'retro-scifi', label: 'Retro Sci-Fi', prompt: 'retro science fiction art style, 1970s sci-fi book cover aesthetic' },
      { id: 'propaganda-poster', label: 'Propaganda Poster', prompt: 'propaganda poster style, bold flat colors, strong graphic design' },
    ]
  },
  lighting: {
    group: 'Presentation', label: 'Lighting', type: 'single',
    options: [
      { id: 'studio', label: 'Studio', prompt: 'studio lighting, clean, professional' },
      { id: 'dramatic', label: 'Dramatic', prompt: 'dramatic chiaroscuro lighting, strong contrast' },
      { id: 'rim', label: 'Rim Light', prompt: 'rim lighting, backlit, glowing edges' },
      { id: 'candle', label: 'Candlelight', prompt: 'warm candlelight, flickering, intimate' },
      { id: 'golden-hour', label: 'Golden Hour', prompt: 'golden hour sunlight, warm glow' },
      { id: 'moonlight', label: 'Moonlight', prompt: 'cold moonlight, blue tones, night' },
      { id: 'magical', label: 'Magical', prompt: 'ethereal magical light, supernatural glow' },
      { id: 'campfire', label: 'Campfire', prompt: 'warm campfire light, orange glow, outdoor' },
      { id: 'stormy', label: 'Stormy', prompt: 'stormy dramatic lighting, lightning flash' },
      { id: 'neon', label: 'Neon', prompt: 'neon colored lighting, vibrant, stylized' },
      { id: 'fluorescent', label: 'Fluorescent', prompt: 'harsh fluorescent overhead lighting, institutional' },
      { id: 'holographic', label: 'Holographic', prompt: 'holographic light, shifting iridescent colors', genres: ['scifi', 'cyberpunk'] },
      { id: 'bioluminescent', label: 'Bioluminescent', prompt: 'soft bioluminescent glow, alien organic light', genres: ['scifi', 'horror'] },
      { id: 'emergency-red', label: 'Emergency Red', prompt: 'red emergency lighting, alarm, danger atmosphere' },
    ]
  },
  background: {
    group: 'Presentation', label: 'Background', type: 'single',
    options: [
      // Universal
      { id: 'dark-void', label: 'Dark Void', prompt: 'dark void background, black' },
      { id: 'neutral-studio', label: 'Neutral Studio', prompt: 'neutral studio background, gradient' },
      { id: 'forest', label: 'Forest', prompt: 'dense forest background, dappled light' },
      { id: 'wilderness', label: 'Wilderness', prompt: 'wild untamed landscape, mountains, open sky' },
      { id: 'cave', label: 'Cave / Cavern', prompt: 'cavern interior, stalactites, dim light' },
      // Fantasy
      { id: 'tavern', label: 'Tavern', prompt: 'medieval tavern background, warm interior', genres: ['fantasy', 'western'] },
      { id: 'throne-room', label: 'Throne Room', prompt: 'grand throne room, ornate pillars', genres: ['fantasy'] },
      { id: 'dungeon', label: 'Dungeon', prompt: 'dark dungeon background, stone walls, torches', genres: ['fantasy', 'horror'] },
      { id: 'medieval-city', label: 'Medieval City', prompt: 'medieval city street background', genres: ['fantasy'] },
      { id: 'dark-alley', label: 'Dark Alley', prompt: 'dark narrow alley, shadowy, urban', genres: ['fantasy', 'modern', 'horror'] },
      { id: 'battlefield', label: 'Battlefield', prompt: 'epic battlefield background, smoke and banners', genres: ['fantasy'] },
      { id: 'ship-deck', label: 'Ship Deck', prompt: 'ship deck background, ocean, sailing', genres: ['fantasy'] },
      { id: 'arcane-tower', label: 'Arcane Tower', prompt: 'wizard tower interior, floating books, glowing runes', genres: ['fantasy'] },
      { id: 'temple', label: 'Temple', prompt: 'temple interior, stained glass, divine light', genres: ['fantasy', 'horror'] },
      { id: 'crypt', label: 'Crypt', prompt: 'dark crypt, bones, eerie green light', genres: ['fantasy', 'horror'] },
      { id: 'marketplace', label: 'Marketplace', prompt: 'bustling marketplace, stalls, colorful', genres: ['fantasy', 'steampunk', 'western'] },
      { id: 'monastery', label: 'Monastery', prompt: 'peaceful monastery, zen garden, misty', genres: ['fantasy'] },
      { id: 'castle-wall', label: 'Castle Wall', prompt: 'castle battlements, overlooking kingdom', genres: ['fantasy'] },
      // Sci-Fi
      { id: 'spaceship-interior', label: 'Spaceship Interior', prompt: 'spaceship interior, control panels, metallic corridors', genres: ['scifi'] },
      { id: 'spaceship-cockpit', label: 'Ship Cockpit', prompt: 'spaceship cockpit, stars visible through viewport', genres: ['scifi'] },
      { id: 'space-station', label: 'Space Station', prompt: 'space station corridor, observation windows showing Earth', genres: ['scifi'] },
      { id: 'alien-world', label: 'Alien World', prompt: 'alien planet surface, strange vegetation, unusual sky color', genres: ['scifi'] },
      { id: 'spaceport', label: 'Spaceport', prompt: 'busy spaceport, ships landing, diverse aliens', genres: ['scifi'] },
      { id: 'laboratory', label: 'Laboratory', prompt: 'high-tech laboratory, screens and equipment', genres: ['scifi', 'modern', 'horror'] },
      // Cyberpunk
      { id: 'neon-alley', label: 'Neon Alley', prompt: 'neon-lit cyberpunk alley, holographic ads, rain-slicked streets', genres: ['cyberpunk'] },
      { id: 'hacker-den', label: 'Hacker Den', prompt: 'cluttered hacker den, multiple screens, wires everywhere', genres: ['cyberpunk'] },
      { id: 'corporate-penthouse', label: 'Corp Penthouse', prompt: 'corporate penthouse, floor-to-ceiling windows, city skyline below', genres: ['cyberpunk'] },
      { id: 'nightclub', label: 'Nightclub', prompt: 'cyberpunk nightclub, neon lights, laser beams, crowded', genres: ['cyberpunk'] },
      { id: 'wasteland-road', label: 'Wasteland Road', prompt: 'desolate highway stretching to horizon, broken city skyline in distance', genres: ['cyberpunk', 'postapoc'] },
      // Horror
      { id: 'foggy-street', label: 'Foggy Street', prompt: 'fog-shrouded street, dim street lamps, visibility fading', genres: ['horror'] },
      { id: 'gothic-manor', label: 'Gothic Manor', prompt: 'gothic manor interior, cobwebs, creaking wood, candlelight', genres: ['horror'] },
      { id: 'abandoned-building', label: 'Abandoned Building', prompt: 'abandoned building interior, peeling walls, debris, eerie silence', genres: ['horror', 'postapoc'] },
      { id: 'occult-chamber', label: 'Occult Chamber', prompt: 'occult ritual chamber, candles in circles, symbols on floor', genres: ['horror'] },
      { id: 'graveyard', label: 'Graveyard', prompt: 'misty graveyard at night, tilted tombstones, dead trees', genres: ['horror'] },
      // Modern
      { id: 'city-night', label: 'City Night', prompt: 'modern city at night, streetlights, urban landscape', genres: ['modern'] },
      { id: 'office-penthouse', label: 'Office / Penthouse', prompt: 'modern office penthouse, city view, sleek interior', genres: ['modern'] },
      { id: 'military-base', label: 'Military Base', prompt: 'military base interior, equipment, tactical maps', genres: ['modern'] },
      { id: 'warehouse', label: 'Warehouse', prompt: 'industrial warehouse interior, concrete, harsh lighting', genres: ['modern', 'cyberpunk', 'horror'] },
      // Post-Apoc
      { id: 'wasteland', label: 'Wasteland', prompt: 'desolate wasteland, cracked earth, rusted debris, irradiated sky', genres: ['postapoc'] },
      { id: 'wasteland-ruins', label: 'Ruined City', prompt: 'ruined city, crumbling buildings, overgrown, post-apocalyptic', genres: ['postapoc'] },
      { id: 'wasteland-settlement', label: 'Wasteland Settlement', prompt: 'makeshift settlement, scrap-metal walls, community in ruins', genres: ['postapoc'] },
      // Steampunk
      { id: 'steampunk-city', label: 'Steam City', prompt: 'steampunk city street, brass pipes, steam vents, clockwork architecture', genres: ['steampunk'] },
      { id: 'steampunk-workshop', label: 'Workshop', prompt: 'steampunk inventor workshop, gears on walls, blueprints, welding sparks', genres: ['steampunk'] },
      { id: 'airship-deck', label: 'Airship Deck', prompt: 'airship deck, clouds below, brass railings, open sky', genres: ['steampunk'] },
      { id: 'victorian-interior', label: 'Victorian Interior', prompt: 'opulent Victorian interior, dark wood, gas lamps, velvet', genres: ['steampunk', 'horror'] },
      // Western
      { id: 'dusty-town', label: 'Dusty Town', prompt: 'dusty Western frontier town, wooden buildings, hitching posts', genres: ['western'] },
      { id: 'saloon', label: 'Saloon', prompt: 'Western saloon interior, swinging doors, bar, piano', genres: ['western'] },
      { id: 'canyon', label: 'Canyon', prompt: 'desert canyon landscape, red rock, dramatic vistas', genres: ['western'] },
      { id: 'frontier-camp', label: 'Frontier Camp', prompt: 'campsite on the frontier, campfire, horse tied nearby, open plains', genres: ['western'] },
    ]
  }
};

const TRAIT_ORDER = [
  'species', 'age', 'gender', 'ethnicity',
  'build', 'height', 'skin',
  'eye_color', 'hair_style', 'hair_color', 'facial_hair',
  'features',
  'attire', 'weapon', 'accessories',
  'expression', 'pose',
  'shot', 'art_style', 'lighting', 'background'
];

const GROUP_ORDER = [
  'Identity', 'Physique', 'Face & Hair', 'Marks & Features',
  'Attire & Gear', 'Expression & Pose', 'Presentation'
];

const THEME_MAP = {
  fantasy: 'Medieval / Fantasy',
  scifi: 'Sci-Fi / Futuristic',
  cyberpunk: 'Cyberpunk',
  horror: 'Horror / Gothic',
  modern: 'Modern',
  postapoc: 'Post-Apocalyptic',
  steampunk: 'Steampunk',
  western: 'Western / Frontier',
};

const THEME_ORDER = [
  'Universal', 'Medieval / Fantasy', 'Sci-Fi / Futuristic', 'Cyberpunk',
  'Horror / Gothic', 'Modern', 'Post-Apocalyptic', 'Steampunk', 'Western / Frontier'
];

// ─── API Routes ───────────────────────────────────────────────────────────────

// Get trait definitions
app.get('/api/traits', (req, res) => {
  res.json({
    traits: TRAITS,
    order: TRAIT_ORDER,
    groups: GROUP_ORDER,
    archetypes: ARCHETYPES,
    genres: GENRES,
    themeMap: THEME_MAP,
    themeOrder: THEME_ORDER
  });
});

// Get available preview images
const PREVIEWS_DIR = join(__dirname, 'public', 'previews');
app.get('/api/previews', async (req, res) => {
  try {
    if (!existsSync(PREVIEWS_DIR)) return res.json([]);
    const files = await readdir(PREVIEWS_DIR);
    res.json(files.filter(f => /\.(jpg|jpeg|png|webp)$/i.test(f)));
  } catch { res.json([]); }
});

// Get available models
app.get('/api/models', (req, res) => {
  const models = Object.entries(MODEL_CONFIG)
    .filter(([, cfg]) => cfg.client())
    .map(([id, cfg]) => ({
      id,
      label: cfg.label,
      provider: cfg.provider,
      qualities: cfg.qualities,
      defaultQuality: cfg.defaultQuality
    }));
  res.json(models);
});

// Generate image
app.post('/api/generate', async (req, res) => {
  try {
    const { selections, customInputs, customPrompt, model, quality, genre } = req.body;

    const modelCfg = MODEL_CONFIG[model];
    if (!modelCfg) return res.status(400).json({ error: 'Invalid model' });
    if (!modelCfg.client()) return res.status(400).json({ error: 'Model not configured (missing API key)' });

    // Build prompt from selections
    const promptParts = ['1 person, solo, single subject, alone'];

    // Add genre context
    const genreDef = GENRES.find(g => g.id === genre);
    if (genreDef) {
      promptParts.push(genreDef.promptPrefix);
    }

    for (const key of TRAIT_ORDER) {
      const trait = TRAITS[key];
      if (!trait) continue;

      if (trait.type === 'single') {
        const selectedId = selections?.[key];
        if (customInputs?.[key]) {
          promptParts.push(customInputs[key]);
        } else if (selectedId) {
          const opt = trait.options.find(o => o.id === selectedId);
          if (opt) promptParts.push(opt.prompt);
        }
      } else if (trait.type === 'multi') {
        const selectedIds = selections?.[key] || [];
        for (const id of selectedIds) {
          const opt = trait.options.find(o => o.id === id);
          if (opt) promptParts.push(opt.prompt);
        }
        if (customInputs?.[key]) {
          promptParts.push(customInputs[key]);
        }
      }
    }

    // Add user's custom prompt
    if (customPrompt?.trim()) {
      promptParts.push(customPrompt.trim());
    }

    const fullPrompt = promptParts.join(', ');

    // Generate image
    let imageBuffer;

    if (modelCfg.customGenerate) {
      imageBuffer = await geminiGenerate(fullPrompt);
    } else {
      const client = modelCfg.client();
      const params = { model, prompt: fullPrompt, n: 1 };

      if (modelCfg.supportsSize) {
        params.size = '1024x1536';
      }
      if (quality && modelCfg.qualities.length > 0) {
        params.quality = quality;
      }

      const response = await client.images.generate(params);
      const imgData = response.data[0];

      if (imgData.b64_json) {
        imageBuffer = Buffer.from(imgData.b64_json, 'base64');
      } else if (imgData.url) {
        const imgResp = await fetch(imgData.url);
        imageBuffer = Buffer.from(await imgResp.arrayBuffer());
      }
    }

    if (!imageBuffer) {
      return res.status(500).json({ error: 'No image data received from API' });
    }

    // Save image
    const timestamp = Date.now();
    const filename = `forge-${timestamp}.png`;
    const filepath = join(GENERATED_DIR, filename);
    await writeFile(filepath, imageBuffer);

    // Save metadata
    const meta = {
      selections,
      customInputs,
      customPrompt,
      fullPrompt,
      model,
      quality: quality || null,
      genre: genre || null,
      created: new Date().toISOString(),
      favorite: false
    };
    await writeFile(join(GENERATED_DIR, `forge-${timestamp}.json`), JSON.stringify(meta, null, 2));

    res.json({
      id: filename,
      url: `/generated/${filename}`,
      ...meta
    });
  } catch (err) {
    console.error('Generation error:', err);
    const message = err.message || 'Image generation failed';
    res.status(500).json({ error: message });
  }
});

async function geminiGenerate(prompt) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=${GOOGLE_API_KEY}`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseModalities: ['TEXT', 'IMAGE'] }
    })
  });
  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`Gemini API error: ${resp.status} ${body}`);
  }
  const data = await resp.json();
  const parts = data.candidates?.[0]?.content?.parts || [];
  for (const part of parts) {
    if (part.inlineData?.data) {
      return Buffer.from(part.inlineData.data, 'base64');
    }
  }
  throw new Error('No image in Gemini response');
}

// Get gallery
app.get('/api/gallery', async (req, res) => {
  try {
    const files = await readdir(GENERATED_DIR);
    const images = [];

    for (const file of files) {
      if (!/\.(png|jpg|jpeg|webp)$/i.test(file)) continue;

      const baseName = file.replace(/\.[^.]+$/, '');
      let meta = null;
      const metaPath = join(GENERATED_DIR, `${baseName}.json`);
      try {
        meta = JSON.parse(await readFile(metaPath, 'utf-8'));
      } catch { /* no metadata */ }

      images.push({
        id: file,
        url: `/generated/${file}`,
        created: meta?.created || null,
        meta
      });
    }

    images.sort((a, b) => {
      const ta = a.created ? new Date(a.created).getTime() : 0;
      const tb = b.created ? new Date(b.created).getTime() : 0;
      return tb - ta;
    });

    res.json(images);
  } catch (err) {
    res.json([]);
  }
});

// Toggle favorite
app.post('/api/favorite/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const baseName = id.replace(/\.[^.]+$/, '');
    const metaPath = join(GENERATED_DIR, `${baseName}.json`);

    let meta;
    try {
      meta = JSON.parse(await readFile(metaPath, 'utf-8'));
    } catch {
      meta = {};
    }

    meta.favorite = !meta.favorite;
    await writeFile(metaPath, JSON.stringify(meta, null, 2));

    res.json({ favorite: meta.favorite });
  } catch (err) {
    res.status(500).json({ error: 'Failed to toggle favorite' });
  }
});

// Delete image
app.delete('/api/gallery/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const imgPath = join(GENERATED_DIR, id);
    const baseName = id.replace(/\.[^.]+$/, '');
    const metaPath = join(GENERATED_DIR, `${baseName}.json`);

    try { await unlink(imgPath); } catch { /* ok */ }
    try { await unlink(metaPath); } catch { /* ok */ }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete image' });
  }
});

// Export character card data
app.get('/api/export/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const baseName = id.replace(/\.[^.]+$/, '');
    const metaPath = join(GENERATED_DIR, `${baseName}.json`);

    const meta = JSON.parse(await readFile(metaPath, 'utf-8'));

    const traitSummary = {};
    if (meta.selections) {
      for (const [key, val] of Object.entries(meta.selections)) {
        const trait = TRAITS[key];
        if (!trait) continue;
        if (trait.type === 'single') {
          const opt = trait.options.find(o => o.id === val);
          traitSummary[trait.label] = opt?.label || val;
        } else if (Array.isArray(val)) {
          traitSummary[trait.label] = val.map(v => {
            const opt = trait.options.find(o => o.id === v);
            return opt?.label || v;
          });
        }
      }
    }

    res.json({
      id,
      imageUrl: `/generated/${id}`,
      traits: traitSummary,
      customInputs: meta.customInputs,
      customPrompt: meta.customPrompt,
      model: meta.model,
      quality: meta.quality,
      genre: meta.genre,
      fullPrompt: meta.fullPrompt,
      created: meta.created
    });
  } catch (err) {
    res.status(500).json({ error: 'Export failed' });
  }
});

// ─── Start ────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`NPC Forge running at http://localhost:${PORT}`);
  const models = Object.entries(MODEL_CONFIG).filter(([, c]) => c.client()).map(([id]) => id);
  console.log(`Available models: ${models.length ? models.join(', ') : 'none (check .env)'}`);
});
