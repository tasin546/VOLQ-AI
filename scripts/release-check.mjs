import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

let hasErrors = false;
let warningCount = 0;

function error(msg) {
  console.error(`❌ ERROR: ${msg}`);
  hasErrors = true;
}

function warn(msg) {
  console.warn(`⚠️  WARNING: ${msg}`);
  warningCount++;
}

function success(msg) {
  console.log(`✅ ${msg}`);
}

console.log('🔍 Running VOLQ AI Pre-Release Verification & Leak Check...\n');

// 1. Check License & Legal Files
const requiredLegalFiles = [
  'LICENSE',
  'THIRD_PARTY_NOTICES.md',
  'SECURITY.md',
  'CONTRIBUTING.md',
  'CHANGELOG.md',
];

for (const file of requiredLegalFiles) {
  const filePath = path.join(rootDir, file);
  if (!fs.existsSync(filePath)) {
    error(`Missing mandatory legal file: ${file}`);
  } else {
    success(`Found ${file}`);
  }
}

// 2. Check Package Manifests
const manifests = [
  { path: 'package.json', expectedName: 'volq-ai' },
  { path: 'apps/server/package.json', expectedName: '@volq-ai/server' },
  { path: 'apps/web/package.json', expectedName: '@volq-ai/web' },
];

for (const m of manifests) {
  const fullPath = path.join(rootDir, m.path);
  if (!fs.existsSync(fullPath)) {
    error(`Missing package manifest: ${m.path}`);
    continue;
  }
  const pkg = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
  if (pkg.name !== m.expectedName) {
    error(`${m.path}: expected name "${m.expectedName}", got "${pkg.name}"`);
  }
  if (pkg.version !== '1.0.0') {
    error(`${m.path}: expected version "1.0.0", got "${pkg.version}"`);
  }
  if (pkg.license !== 'MIT') {
    error(`${m.path}: expected license "MIT", got "${pkg.license}"`);
  }
  success(`${m.path} verified (name, version 1.0.0, MIT)`);
}

// 3. Check for Dangerous Personal Data / Leaks
const SENSITIVE_PATTERNS = [
  { pattern: /fahimtasin226@gmail\.com/g, desc: 'Personal email address' },
  { pattern: /\/home\/tasin\//g, desc: 'Absolute developer home path' },
  { pattern: /re_[a-zA-Z0-9_-]{20,}/g, desc: 'Live Resend API key' },
  { pattern: /ghp_[a-zA-Z0-9]{30,}/g, desc: 'GitHub Personal Access Token' },
  { pattern: /sk-ant-[a-zA-Z0-9_-]{30,}/g, desc: 'Anthropic API key' },
];

const SCAN_DIRS = ['apps/server/src', 'apps/web/src', 'scripts', 'docs'];

function scanFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  for (const item of SENSITIVE_PATTERNS) {
    if (item.pattern.test(content)) {
      // Allow SECURITY.md security contact email if explicitly allowed
      if (item.desc === 'Personal email address' && filePath.endsWith('SECURITY.md')) {
        continue;
      }
      error(`Found ${item.desc} in: ${path.relative(rootDir, filePath)}`);
    }
  }

  if (content.includes('REPLACE_' + 'ME') && !filePath.endsWith('release-check.mjs')) {
    warn(`Found placeholder REPLACE_ME in: ${path.relative(rootDir, filePath)}`);
  }
}

function scanDir(dir) {
  const fullDir = path.join(rootDir, dir);
  if (!fs.existsSync(fullDir)) return;
  const entries = fs.readdirSync(fullDir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(fullDir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules' && entry.name !== 'dist' && entry.name !== '.git') {
        scanDir(path.join(dir, entry.name));
      }
    } else if (
      entry.isFile() &&
      /\.(ts|tsx|js|mjs|json|md|yml|yaml|css|html)$/.test(entry.name)
    ) {
      scanFile(fullPath);
    }
  }
}

for (const dir of SCAN_DIRS) {
  scanDir(dir);
}

// Also scan root config files
const rootConfigs = [
  'docker-compose.yml',
  '.env.example',
  '.dockerignore',
  '.gitignore',
  'README.md',
];
for (const conf of rootConfigs) {
  const fullConf = path.join(rootDir, conf);
  if (fs.existsSync(fullConf)) {
    scanFile(fullConf);
  }
}

// 4. Check for Untracked Local Databases or Secrets
const FORBIDDEN_FILES = [
  '.env',
  '.dev-secrets.json',
  'apps/server/data/volq.db',
  'apps/server/data/volq.db-wal',
  'apps/server/data/volq.db-shm',
  '.verify-data/volq.db',
];

for (const f of FORBIDDEN_FILES) {
  const fullP = path.join(rootDir, f);
  if (fs.existsSync(fullP)) {
    // If running in wipe verification mode, this is an error; otherwise warn
    warn(`Data-bearing local file currently exists on disk: ${f} (must be wiped before release)`);
  }
}

console.log('\n----------------------------------------');
if (hasErrors) {
  console.error(`❌ RELEASE CHECK FAILED with errors.`);
  process.exit(1);
} else {
  console.log(`✨ All mandatory pre-release checks passed! (${warningCount} pending warning(s) / placeholders).`);
  process.exit(0);
}
