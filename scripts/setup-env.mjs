import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const envPath = path.join(rootDir, '.env');
const examplePath = path.join(rootDir, '.env.example');

const isForce = process.argv.includes('--force');

if (fs.existsSync(envPath) && !isForce) {
  console.log('⚡ .env file already exists at: ' + envPath);
  console.log('   Pass --force to overwrite it with newly generated secrets.');
  process.exit(0);
}

if (!fs.existsSync(examplePath)) {
  console.error('❌ Could not find .env.example template at: ' + examplePath);
  process.exit(1);
}

let content = fs.readFileSync(examplePath, 'utf8');

const generatedSessionSecret = crypto.randomBytes(32).toString('hex');
const generatedEncryptionKey = crypto.randomBytes(32).toString('hex');

content = content.replace(
  /SESSION_SECRET=.*/,
  `SESSION_SECRET=${generatedSessionSecret}`
);
content = content.replace(
  /ENCRYPTION_KEY=.*/,
  `ENCRYPTION_KEY=${generatedEncryptionKey}`
);

// If local development, set NODE_ENV=development and DATABASE_PATH=./data/volq.db
content = content.replace(/NODE_ENV=production/, 'NODE_ENV=development');
content = content.replace(/DATABASE_PATH=\/data\/volq\.db/, 'DATABASE_PATH=./data/volq.db');

fs.writeFileSync(envPath, content, { mode: 0o600 });

console.log('✅ Created fresh .env configuration with cryptographically secure random secrets:');
console.log('   • SESSION_SECRET generated (64 hex characters)');
console.log('   • ENCRYPTION_KEY generated (64 hex characters)');
console.log('   • Permissions set to 0600 (owner read/write only)');
