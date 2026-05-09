import { rmSync } from 'node:fs';
import { join } from 'node:path';

const optionalNativePackages = [
  'canvas',
];

for (const packageName of optionalNativePackages) {
  const packagePath = join(process.cwd(), 'node_modules', packageName);
  rmSync(packagePath, { recursive: true, force: true });
}
