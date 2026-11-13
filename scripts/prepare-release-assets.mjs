import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const docsImagesDir = path.join(rootDir, 'docs/images');
if (!fs.existsSync(docsImagesDir)) {
  fs.mkdirSync(docsImagesDir, { recursive: true });
}

const subagentDir = process.env.SUBAGENT_SCREENSHOT_DIR || path.join(rootDir, 'docs/images');

// Map subagent files to target docs/images filenames
const mapping = [
  { match: /(^step_2\.png$|welcome\.png$)/, target: 'welcome.png' },
  { match: /auth-signin\.png$/, target: 'auth-signin.png' },
  { match: /chat-obsidian\.png$/, target: 'chat-obsidian.png' },
  { match: /chat-amoled\.png$/, target: 'chat-amoled.png' },
  { match: /chat-frost\.png$/, target: 'chat-frost.png' },
  { match: /sidebar\.png$/, target: 'sidebar.png' },
  { match: /settings-user\.png$/, target: 'settings-user.png' },
  { match: /settings-models\.png$/, target: 'settings-models.png' },
  { match: /settings-oauth\.png$/, target: 'settings-oauth.png' },
  { match: /settings-knowledge\.png$/, target: 'settings-knowledge.png' },
  { match: /voice-tts\.png$/, target: 'voice-tts.png' },
  { match: /model-compare\.png$/, target: 'model-compare.png' },
  { match: /mobile-chat\.png$/, target: 'mobile-chat.png' },
  { match: /mobile-actions\.png$/, target: 'mobile-actions.png' },
];

console.log('🖼️ Processing and optimizing release screenshots...');

if (fs.existsSync(subagentDir)) {
  const files = fs.readdirSync(subagentDir);
  for (const m of mapping) {
    const matched = files.filter((f) => m.match.test(f)).sort();
    if (matched.length > 0) {
      // Pick the best matched file (for welcome, prefer step_2.png which contains the rendered mountain scene)
      let selectedFile = matched[matched.length - 1];
      if (m.target === 'welcome.png' && files.includes('step_2.png')) {
        selectedFile = 'step_2.png';
      }
      const sourceFile = path.join(subagentDir, selectedFile);
      const targetFile = path.join(docsImagesDir, m.target);
      
      const buffer = fs.readFileSync(sourceFile);
      // Strip EXIF metadata and write
      await sharp(buffer)
        .withMetadata(false)
        .png()
        .toFile(targetFile);

      console.log(`  ✓ ${m.target} (copied & EXIF stripped, ${(fs.statSync(targetFile).size / 1024).toFixed(1)} KB)`);
    }
  }
}

// Generate Clean Hero Image (hero.webp)
const desktopChatPath = path.join(docsImagesDir, 'chat-obsidian.png');
const heroWebpPath = path.join(docsImagesDir, 'hero.webp');

if (fs.existsSync(desktopChatPath)) {
  console.log('\n🎨 Generating clean hero image (docs/images/hero.webp)...');
  
  // Use high-quality WebP conversion preserving pristine native aspect ratio and UI sharpness
  await sharp(desktopChatPath)
    .withMetadata(false)
    .webp({ quality: 95, effort: 6 })
    .toFile(heroWebpPath);

  console.log(`  ✓ Created docs/images/hero.webp (${(fs.statSync(heroWebpPath).size / 1024).toFixed(1)} KB)`);
}

// Also strip EXIF from root bg.jpg if present
const bgJpgPath = path.join(rootDir, 'bg.jpg');
if (fs.existsSync(bgJpgPath)) {
  const bgBuf = fs.readFileSync(bgJpgPath);
  await sharp(bgBuf).withMetadata(false).toFile(bgJpgPath + '.clean');
  fs.renameSync(bgJpgPath + '.clean', bgJpgPath);
  console.log('  ✓ Verified bg.jpg EXIF metadata stripped.');
}

console.log('\n✅ All release images processed successfully.');
