import fs from 'node:fs';

const args = process.argv.slice(2);
const lockFiles = args;

if (lockFiles.length === 0) {
  throw new Error('At least one package-lock.json path is required.');
}

const packages = new Map();

for (const lockFile of lockFiles) {
  const lock = JSON.parse(fs.readFileSync(lockFile, 'utf8'));

  for (const [packagePath, metadata] of Object.entries(lock.packages ?? {})) {
    if (!packagePath || metadata.dev || metadata.link) {
      continue;
    }

    const marker = 'node_modules/';
    const markerIndex = packagePath.lastIndexOf(marker);
    const name = metadata.name ?? (markerIndex >= 0 ? packagePath.slice(markerIndex + marker.length) : '');

    if (!name || !metadata.version) {
      continue;
    }

    packages.set(`${name}@${metadata.version}`, { name, version: metadata.version });
  }
}

const provides = [...packages.values()]
  .sort((left, right) => left.name.localeCompare(right.name) || left.version.localeCompare(right.version))
  .map(({ name, version }) => `Provides: bundled(npm(${name})) = ${version}`);

process.stdout.write(`${provides.join('\n')}\n`);
