require('dotenv').config();

const express = require('express');
const cors = require('cors');
const axios = require('axios');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const satellite = require('satellite.js');

const app = express();
app.use(cors({ origin: process.env.CORS_ORIGIN || '*' }));
app.use(express.json({ limit: '1mb' }));

const PORT = process.env.PORT || 3001;
const GEMINI_API_KEY = (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '').trim();
console.log("🔍 THE SERVER SEES THIS KEY:", GEMINI_API_KEY ? GEMINI_API_KEY.substring(0, 5) + "..." : "NOTHING!");
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const N2YO_API_KEY = process.env.N2YO_API_KEY;

// INCREASED TIMEOUT: Now waits 10 seconds for the free API instead of 5
const EXTERNAL_API_TIMEOUT_MS = 10000; 

const genAI = GEMINI_API_KEY ? new GoogleGenerativeAI(GEMINI_API_KEY) : null;
if (!GEMINI_API_KEY) {
  console.error('GEMINI_API_KEY is empty or missing.');
}

let tleCache = { updatedAt: 0, source: 'none', items: [] };
let issCache = { updatedAt: 0, data: null };
let positionCache = { updatedAt: 0, fromTleAt: 0, items: [] };
let issBackoffUntil = 0;
let issFailureStreak = 0;
let lastIssErrorLogAt = 0;

const FALLBACK_ISS = {
  id: 25544,
  name: 'ISS (fallback)',
  latitude: 0,
  longitude: 0,
  altitude: 420,
  velocity: 27500
};

const getIssFallback = () => {
  const minuteStep = Math.floor(Date.now() / 60000) % 360;
  return { ...FALLBACK_ISS, longitude: minuteStep - 180 };
};

const LOCAL_FALLBACK_TLE = `
ISS (ZARYA)
1 25544U 98067A   26109.39223485  .00010456  00000+0  19012-3 0  9991
2 25544  51.6404 233.1565 0004868 187.5779 260.9582 15.50021433506714
SUOMI NPP
1 37849U 11061A   26109.41110893  .00000049  00000+0  36724-4 0  9999
2 37849  98.7334 166.6943 0001310  84.8110 275.3248 14.19539127746303
TERRA
1 25994U 99068A   26109.49061073  .00000123  00000+0  49776-4 0  9990
2 25994  98.2082 182.1496 0001094  85.3299 274.8042 14.57110604393818
`.trim();

const buildTleItem = (name, line1, line2) => {
  const match = line1.match(/^1\s+(\d+)/);
  return { name: name || 'UNKNOWN', line1, line2, satId: match ? Number.parseInt(match[1], 10) : null };
};

const parseTleBlock = (text) => {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const items = [];
  for (let i = 0; i + 2 < lines.length; i += 3) items.push(buildTleItem(lines[i], lines[i + 1], lines[i + 2]));
  return items;
};

// RESTORED: The missing TLE Cache function to prevent the crash
const refreshTleCache = async () => {
  try {
    tleCache = { updatedAt: Date.now(), source: 'embedded', items: parseTleBlock(LOCAL_FALLBACK_TLE) };
  } catch (error) {
    console.error('TLE refresh failed:', error.message);
  }
};

const computePositions = (items, date) => {
  const gmst = satellite.gstime(date);
  return items.map((item) => {
    const satrec = satellite.twoline2satrec(item.line1, item.line2);
    const positionAndVelocity = satellite.propagate(satrec, date);
    if (!positionAndVelocity.position) return null;
    const geodetic = satellite.eciToGeodetic(positionAndVelocity.position, gmst);
    return {
      id: String(item.satId),
      name: item.name,
      latitude: satellite.degreesLat(geodetic.latitude),
      longitude: satellite.degreesLong(geodetic.longitude),
      altitude: geodetic.height,
      velocity: 27500
    };
  }).filter(Boolean);
};

const refreshIssCache = async () => {
  const now = Date.now();
  if (now < issBackoffUntil) {
    if (!issCache.data || issCache.data.name === FALLBACK_ISS.name) {
      issCache = { updatedAt: now, data: getIssFallback() };
    }
    return;
  }

  try {
    // FIXED URL: Changed '&apiKey' to '?apiKey' so N2YO accepts it properly
    const url = `https://api.n2yo.com/rest/v1/satellite/positions/25544/17.375289/78.47439/0/1/?apiKey=${N2YO_API_KEY}`;
    
    const response = await axios.get(url, { timeout: EXTERNAL_API_TIMEOUT_MS });
    const pos = response.data.positions[0];

    const formattedData = {
        name: "ISS",
        latitude: pos.satlatitude,
        longitude: pos.satlongitude,
        altitude: pos.sataltitude,
        velocity: 27539
    };

    issCache = { updatedAt: Date.now(), data: formattedData };
    issFailureStreak = 0;
    issBackoffUntil = 0;
  } catch (error) {
    if (!issCache.data || issCache.data.name === FALLBACK_ISS.name) {
      issCache = { updatedAt: Date.now(), data: getIssFallback() };
    }
    issFailureStreak += 1;
    const backoffMs = Math.min(5 * 60 * 1000, Math.max(15000, 2 ** (issFailureStreak - 1) * 15000));
    issBackoffUntil = Date.now() + backoffMs;
    console.error(`ISS API timeout/error. Using safety fallback data.`);
  }
};

app.get('/api/iss', async (req, res) => {
  if (!issCache.data || Date.now() - issCache.updatedAt > 5000) await refreshIssCache();
  res.json(issCache.data);
});

app.get('/api/satellites', async (req, res) => {
  if (!tleCache.items.length) await refreshTleCache();
  const items = computePositions(tleCache.items, new Date());
  res.json({ count: items.length, satellites: items });
});

app.post('/api/ai/explain', async (req, res) => {
  const { satelliteName } = req.body;
  if (!satelliteName) return res.status(400).json({ error: 'satelliteName is required' });
  if (!genAI) return res.status(500).json({ error: 'Missing GEMINI_API_KEY' });
  
  try {
    const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });
    const prompt = `Explain what the satellite "${satelliteName}" does in exactly 3 bullet points, as if talking to a 10-year-old. Keep each bullet to one short sentence.`;
    const result = await model.generateContent(prompt);
    const response = await result.response;
    res.json({ explanation: response.text() });
  } catch (error) {
    const message = error?.message || 'Gemini request failed';
    console.error('GEMINI ERROR:', message);
    if (message.includes('[503') || message.includes('high demand')) {
      return res.status(503).json({ error: 'Gemini is busy right now. Please tap again in a moment.' });
    }
    if (message.includes('[429')) {
      return res.status(429).json({ error: 'Gemini rate limit reached. Please wait a bit and try again.' });
    }
    res.status(500).json({ error: `Gemini error: ${message}` });
  }
});

// Initialize caches
refreshTleCache();
setInterval(refreshTleCache, 60000);
refreshIssCache();
setInterval(refreshIssCache, 5000);

app.listen(PORT, () => console.log(`>>> ASTROSIGHT BACKEND ACTIVE ON PORT ${PORT} <<<`));
