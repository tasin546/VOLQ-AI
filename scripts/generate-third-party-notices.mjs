import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

function getDirectDeps(pkgPath) {
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  return { ...pkg.dependencies, ...pkg.devDependencies };
}

const directDeps = new Set([
  ...Object.keys(getDirectDeps(path.join(rootDir, 'package.json'))),
  ...Object.keys(getDirectDeps(path.join(rootDir, 'apps/server/package.json'))),
  ...Object.keys(getDirectDeps(path.join(rootDir, 'apps/web/package.json'))),
]);

const records = [];

for (const dep of Array.from(directDeps).sort()) {
  const pkgJsonPath = path.join(rootDir, 'node_modules', dep, 'package.json');
  if (fs.existsSync(pkgJsonPath)) {
    try {
      const data = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));
      const license = typeof data.license === 'object' ? data.license.type : (data.license || 'Unknown');
      const version = data.version || '';
      const repoUrl = typeof data.repository === 'object' ? (data.repository.url || '') : (data.repository || '');
      records.push({ name: dep, version, license, repoUrl });
    } catch {
      records.push({ name: dep, version: '', license: 'Unknown', repoUrl: '' });
    }
  }
}

let md = '# Third-Party Notices and Open Source Licenses\n\n';
md += 'VOLQ AI incorporates open-source software and digital assets. This document outlines the third-party dependencies, assets, and licenses used in this project.\n\n';
md += '## 1. Digital Assets & Media\n\n';
md += '### Outfit Font Family\n';
md += '- **Project**: Outfit Variable Font by Rodrigo Fuenzalida\n';
md += '- **License**: SIL Open Font License 1.1 (OFL-1.1)\n';
md += '- **Repository**: https://github.com/Outfitio/outfit-fonts\n\n';

md += '### Lucide Icons\n';
md += '- **Project**: Lucide Icons\n';
md += '- **License**: ISC License\n';
md += '- **Repository**: https://github.com/lucide-icons/lucide\n\n';

md += '### Welcome Screen Wallpaper (bg.jpg)\n';
md += '- **Photographer**: Cristina Gottardi\n';
md += '- **Source**: Unsplash (https://unsplash.com/photos/wndpWTiTv4c)\n';
md += '- **License**: Unsplash License (free for commercial and personal use, no permission required)\n\n';

md += '### Third-Party Logos and Brand Marks\n';
md += 'The brand marks and logos for Google, Discord, GitHub, Microsoft, GitLab, LinkedIn, and OpenID Foundation included in this repository are used strictly for referential and identification purposes to represent supported sign-in and integration methods. All trademarks and registered trademarks remain the property of their respective owners.\n\n';

md += '## 2. Dynamic Library & Compiler Licenses\n\n';
md += '### Sharp & libvips (LGPL-3.0-or-later)\n';
md += 'Sharp dynamically loads precompiled libvips shared libraries under the LGPL-3.0-or-later license. The VOLQ AI project links against libvips dynamically without modifying its C source code.\n\n';

md += '### LightningCSS (MPL-2.0)\n';
md += 'LightningCSS is utilized solely as a devDependency CSS compiler during the Vite build process under the Mozilla Public License 2.0 (MPL-2.0).\n\n';

md += '## 3. Direct Dependencies License Registry\n\n';
md += '| Package | Version | License | Source Repository |\n';
md += '| :--- | :--- | :--- | :--- |\n';

for (const r of records) {
  const cleanRepo = r.repoUrl.replace(/^git\+/, '').replace(/\.git$/, '');
  md += `| \`${r.name}\` | ${r.version} | ${r.license} | ${cleanRepo || 'N/A'} |\n`;
}

fs.writeFileSync(path.join(rootDir, 'THIRD_PARTY_NOTICES.md'), md, 'utf8');
console.log(`Successfully wrote THIRD_PARTY_NOTICES.md with ${records.length} packages.`);
