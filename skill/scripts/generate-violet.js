#!/usr/bin/env node
const fs = require('fs');
const os = require('os');
const path = require('path');

function arg(name, fallback = '') {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

function die(msg) {
  console.error(`ERROR: ${msg}`);
  process.exit(1);
}

function expandHome(p) {
  if (!p) return p;
  if (p === '~') return os.homedir();
  if (p.startsWith('~/')) return path.join(os.homedir(), p.slice(2));
  return p;
}

function isUrl(s) {
  return /^https?:\/\//i.test(s || '');
}

function mimeFor(file) {
  const ext = path.extname(file).toLowerCase();
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.webp') return 'image/webp';
  return 'image/png';
}

function imageInput(ref) {
  if (!ref) return '';
  if (isUrl(ref) || ref.startsWith('data:image/')) return ref;
  const file = expandHome(ref);
  if (!fs.existsSync(file)) die(`VIOLET_REFERENCE_IMAGE file not found: ${file}`);
  const b64 = fs.readFileSync(file).toString('base64');
  return `data:${mimeFor(file)};base64,${b64}`;
}

function detectMode(context, requested) {
  if (requested && !['auto', 'direct', 'mirror'].includes(requested)) die('--mode must be auto, direct, or mirror');
  if (requested && requested !== 'auto') return requested;
  if (/outfit|wearing|clothes|dress|suit|fashion|full-body|mirror/i.test(context)) return 'mirror';
  if (/cafe|restaurant|beach|park|city|close-up|portrait|face|eyes|smile|location/i.test(context)) return 'direct';
  return 'direct';
}

function buildPrompt(context, mode, reference) {
  const refText = reference ? 'Use the provided reference image to preserve Violet identity, face structure, hairstyle, and overall character consistency. ' : '';
  if (mode === 'mirror') {
    return `${refText}Create a stylish mirror selfie of Violet, ${context}. Natural phone selfie composition, casual candid vibe, realistic lighting, social media photo, high detail. Do not add text or watermark.`;
  }
  return `${refText}Create a close-up direct selfie of Violet, ${context}. Phone held at arm length, direct eye contact, face clearly visible, natural candid expression, realistic lighting, social media photo, high detail. Do not add text or watermark.`;
}

async function discoverModel(baseUrl, key) {
  const preferred = (process.env.VIOLET_MODEL_FALLBACKS || 'cx/gpt-5.5-image,cx/gpt-5.4-image,cx/gpt-5.3-image')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
  const headers = {};
  if (key) headers.Authorization = `Bearer ${key}`;
  const res = await fetch(`${baseUrl}/v1/models/image`, { headers });
  if (!res.ok) return preferred[0] || 'cx/gpt-5.5-image';
  const data = await res.json();
  const ids = (data.data || []).map(m => m.id).filter(Boolean);
  return preferred.find(id => ids.includes(id)) || ids[0] || preferred[0] || 'cx/gpt-5.5-image';
}

async function main() {
  const baseUrl = (process.env.NINEROUTER_URL || '').replace(/\/$/, '');
  const key = process.env.NINEROUTER_KEY || '';
  const model = process.env.VIOLET_IMAGE_MODEL || await discoverModel(baseUrl, key);
  const reference = imageInput(process.env.VIOLET_REFERENCE_IMAGE || '');
  const size = process.env.VIOLET_SIZE || '1024x1024';
  const outDir = expandHome(process.env.VIOLET_OUTPUT_DIR || '~/.openclaw/workspace/generated/violet-selfie');
  const context = arg('context', '').trim();
  const mode = detectMode(context, arg('mode', 'auto'));

  if (!baseUrl) die('NINEROUTER_URL missing');
  if (!context) die('--context missing');

  fs.mkdirSync(outDir, { recursive: true });

  const prompt = buildPrompt(context, mode, reference);
  const body = { model, prompt, size, n: 1, response_format: 'b64_json' };
  if (reference) {
    body.image = reference;
    body.images = [reference];
  }

  const headers = { 'Content-Type': 'application/json' };
  if (key) headers.Authorization = `Bearer ${key}`;

  let bytes;
  let ext = 'png';

  const binaryRes = await fetch(`${baseUrl}/v1/images/generations?response_format=binary`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body)
  });

  if (binaryRes.ok && (binaryRes.headers.get('content-type') || '').startsWith('image/')) {
    const ct = binaryRes.headers.get('content-type') || '';
    if (ct.includes('jpeg') || ct.includes('jpg')) ext = 'jpg';
    if (ct.includes('webp')) ext = 'webp';
    bytes = Buffer.from(await binaryRes.arrayBuffer());
  } else {
    const text = await binaryRes.text();
    if (!binaryRes.ok) die(`9Router HTTP ${binaryRes.status}: ${text.slice(0, 500)}`);
    let data;
    try { data = JSON.parse(text); } catch { die(`invalid response: ${text.slice(0, 500)}`); }
    const item = data?.data?.[0];
    if (!item) die(`no image in response: ${text.slice(0, 500)}`);
    if (item.b64_json) {
      bytes = Buffer.from(item.b64_json, 'base64');
    } else if (item.url) {
      const img = await fetch(item.url);
      if (!img.ok) die(`failed to fetch image URL ${img.status}`);
      const ct = img.headers.get('content-type') || '';
      if (ct.includes('jpeg') || ct.includes('jpg')) ext = 'jpg';
      if (ct.includes('webp')) ext = 'webp';
      bytes = Buffer.from(await img.arrayBuffer());
    } else {
      die(`unsupported image response: ${JSON.stringify(item).slice(0, 500)}`);
    }
  }

  const file = path.join(outDir, `violet-${Date.now()}.${ext}`);
  fs.writeFileSync(file, bytes);
  console.log(`MEDIA:${file}`);
}

main().catch(e => die(e.stack || e.message));
