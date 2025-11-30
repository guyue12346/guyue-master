import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const releaseDir = path.join(__dirname, '../release');
const backupDir = path.join(releaseDir, 'backup');

console.log('Checking for previous DMG builds to backup...');

if (!fs.existsSync(releaseDir)) {
  console.log('No release directory found, skipping backup.');
  process.exit(0);
}

if (!fs.existsSync(backupDir)) {
  fs.mkdirSync(backupDir, { recursive: true });
}

const files = fs.readdirSync(releaseDir);
const dmgFiles = files.filter(file => file.endsWith('.dmg'));

if (dmgFiles.length === 0) {
  console.log('No DMG files found to backup.');
  process.exit(0);
}

dmgFiles.forEach(file => {
  const srcPath = path.join(releaseDir, file);
  const stats = fs.statSync(srcPath);
  const mtime = stats.mtime;
  
  // Format date as YYYYMMDD-HHmmss
  const dateStr = mtime.getFullYear().toString() +
    (mtime.getMonth() + 1).toString().padStart(2, '0') +
    mtime.getDate().toString().padStart(2, '0') + '-' +
    mtime.getHours().toString().padStart(2, '0') +
    mtime.getMinutes().toString().padStart(2, '0') +
    mtime.getSeconds().toString().padStart(2, '0');

  const ext = path.extname(file);
  const name = path.basename(file, ext);
  const backupName = `${name}_${dateStr}${ext}`;
  const destPath = path.join(backupDir, backupName);

  console.log(`Backing up ${file} to ${backupName}...`);
  fs.copyFileSync(srcPath, destPath);
});

console.log('Backup complete.');
