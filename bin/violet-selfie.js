#!/usr/bin/env node
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const SKILL_DIR = path.join(ROOT, 'skill');
const DEFAULT_MODELS = ['cx/gpt-5.5-image', 'cx/gpt-5.4-image', 'cx/gpt-5.3-image'];

function usage() {
  console.log(`violet-selfie

Commands:
  install [--target openclaw|hermes] [--home <dir>] [--base-url <url>] [--model <id>] [--reference <file>] [--write-soul]
  set-reference <image-file> [--home <dir>] [--target openclaw|hermes]
  models [--base-url <url>] [--key <key>]
  generate --context <text> [--mode auto|direct|mirror] [--home <dir>]

Examples:
  violet-selfie install --target hermes --home ~/.hermes --reference ./violet.jpg
  violet-selfie set-reference ./violet.jpg --home ~/.hermes
  violet-selfie generate --context "cozy cafe" --mode direct --home ~/.hermes`);
}

function arg(name, fallback = '') {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

function expandHome(p) {
  if (!p) return p;
  if (p === '~') return os.homedir();
  if (p.startsWith('~/')) return path.join(os.homedir(), p.slice(2));
  return p;
}

function detectTarget() {
  if (process.env.HERMES_HOME || fs.existsSync(path.join(os.homedir(), '.hermes'))) return 'hermes';
  return 'openclaw';
}

function homeFor(target) {
  return target === 'hermes'
    ? (process.env.HERMES_HOME || path.join(os.homedir(), '.hermes'))
    : (process.env.OPENCLAW_HOME || path.join(os.homedir(), '.openclaw'));
}

function envFile(home) {
  return path.join(home, '.env');
}

function skillDest(home) {
  return path.join(home, 'skills', 'violet-selfie');
}

function outputDir(home, target) {
  return target === 'hermes'
    ? path.join(home, 'image_cache', 'violet-selfie')
    : path.join(home, 'workspace', 'generated', 'violet-selfie');
}

function copyDir(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const from = path.join(src, entry.name);
    const to = path.join(dst, entry.name);
    if (entry.isDirectory()) copyDir(from, to);
    else fs.copyFileSync(from, to);
  }
}

function upsertEnv(file, values) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  let lines = fs.existsSync(file) ? fs.readFileSync(file, 'utf8').split(/\r?\n/) : [];
  const keys = new Set(Object.keys(values));
  lines = lines.filter(line => {
    if (!line || line.trim().startsWith('#') || !line.includes('=')) return true;
    const k = line.split('=', 1)[0].trim();
    return !keys.has(k);
  });
  if (fs.existsSync(file)) fs.copyFileSync(file, `${file}.bak-violet-${Date.now()}`);
  lines.push('', '# Violet selfie skill');
  for (const [k, v] of Object.entries(values)) lines.push(`${k}=${v}`);
  fs.writeFileSync(file, lines.join('\n').replace(/\n{3,}/g, '\n\n') + '\n');
}

function setReference(home, target, src) {
  const source = expandHome(src);
  if (!source || !fs.existsSync(source)) throw new Error(`reference image not found: ${source || '(empty)'}`);
  const ext = path.extname(source).toLowerCase() || '.jpg';
  const refDir = path.join(home, 'references');
  const dest = path.join(refDir, `violet-reference${ext}`);
  fs.mkdirSync(refDir, { recursive: true, mode: 0o700 });
  fs.copyFileSync(source, dest);
  fs.chmodSync(refDir, 0o700);
  fs.chmodSync(dest, 0o600);
  upsertEnv(envFile(home), { VIOLET_REFERENCE_IMAGE: dest });
  return dest;
}

async function discoverModels(baseUrl, key) {
  const url = `${baseUrl.replace(/\/$/, '')}/v1/models/image`;
  const headers = {};
  if (key) headers.Authorization = `Bearer ${key}`;
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`models HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  return (data.data || []).map(m => m.id).filter(Boolean);
}

async function chooseModel(baseUrl, key, requested) {
  if (requested) return requested;
  const ids = await discoverModels(baseUrl, key);
  return DEFAULT_MODELS.find(m => ids.includes(m)) || ids[0] || DEFAULT_MODELS[0];
}

function appendSoul(home, target) {
  const soul = path.join(home, target === 'hermes' ? 'SOUL.md' : 'workspace/SOUL.md');
  const snippet = fs.readFileSync(path.join(ROOT, 'templates', 'capability-snippet.md'), 'utf8').trim();
  if (!fs.existsSync(soul)) throw new Error(`SOUL.md not found: ${soul}`);
  const current = fs.readFileSync(soul, 'utf8');
  if (current.includes('Violet Selfie Capability')) return false;
  fs.copyFileSync(soul, `${soul}.bak-violet-${Date.now()}`);
  fs.writeFileSync(soul, `${current.trim()}\n\n${snippet}\n`);
  return true;
}

async function install() {
  const target = arg('target', detectTarget());
  if (!['openclaw', 'hermes'].includes(target)) throw new Error('--target must be openclaw or hermes');
  const home = expandHome(arg('home', homeFor(target)));
  const baseUrl = arg('base-url', process.env.NINEROUTER_URL || 'http://127.0.0.1:20128');
  const key = arg('key', process.env.NINEROUTER_KEY || '');
  const model = await chooseModel(baseUrl, key, arg('model', ''));
  const dest = skillDest(home);
  copyDir(SKILL_DIR, dest);
  fs.chmodSync(path.join(dest, 'scripts', 'generate-violet.js'), 0o755);
  fs.mkdirSync(outputDir(home, target), { recursive: true });
  upsertEnv(envFile(home), {
    NINEROUTER_URL: baseUrl,
    VIOLET_IMAGE_MODEL: model,
    VIOLET_OUTPUT_DIR: outputDir(home, target),
    VIOLET_SIZE: arg('size', '1024x1024')
  });
  let ref = '';
  if (arg('reference', '')) ref = setReference(home, target, arg('reference'));
  let soulChanged = false;
  if (hasFlag('write-soul')) soulChanged = appendSoul(home, target);
  console.log(`installed=${dest}`);
  console.log(`env=${envFile(home)}`);
  console.log(`model=${model}`);
  if (ref) console.log(`reference=${ref}`);
  console.log(`soul=${soulChanged ? 'updated' : hasFlag('write-soul') ? 'already-present' : 'unchanged'}`);
}

function loadEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    if (!line || line.trim().startsWith('#') || !line.includes('=')) continue;
    const [k, ...rest] = line.split('=');
    if (!process.env[k]) process.env[k] = rest.join('=');
  }
}

async function main() {
  const cmd = process.argv[2];
  if (!cmd || cmd === '-h' || cmd === '--help') return usage();
  if (cmd === 'models') {
    const ids = await discoverModels(arg('base-url', process.env.NINEROUTER_URL || 'http://127.0.0.1:20128'), arg('key', process.env.NINEROUTER_KEY || ''));
    console.log(ids.join('\n'));
    return;
  }
  if (cmd === 'install') return install();
  if (cmd === 'set-reference') {
    const target = arg('target', detectTarget());
    const home = expandHome(arg('home', homeFor(target)));
    const ref = setReference(home, target, process.argv[3]);
    console.log(`reference=${ref}`);
    return;
  }
  if (cmd === 'generate') {
    const target = arg('target', detectTarget());
    const home = expandHome(arg('home', homeFor(target)));
    loadEnv(envFile(home));
    const script = path.join(skillDest(home), 'scripts', 'generate-violet.js');
    const args = [script, '--context', arg('context', ''), '--mode', arg('mode', 'auto')];
    const r = spawnSync(process.execPath, args, { stdio: 'inherit', env: process.env });
    process.exit(r.status || 0);
  }
  throw new Error(`unknown command: ${cmd}`);
}

main().catch(e => { console.error(`ERROR: ${e.message}`); process.exit(1); });
