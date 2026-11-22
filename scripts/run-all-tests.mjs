import { spawnSync } from 'node:child_process';
import path from 'node:path';

const nodeBin = process.execPath;
const suites = [
  'src/tests/phase1-foundation.spec.ts',
  'src/tests/phase2-catalogs.spec.ts',
  'src/tests/phase3-4-inventory-sales.spec.ts',
  'src/tests/phase5-finance.spec.ts',
  'src/tests/phase6-intelligence.spec.ts',
  'src/tests/phase7-subscriptions.spec.ts',
  'src/tests/phase8-import.spec.ts',
  'src/tests/phase9-quality-launch.spec.ts',
];

console.log('======================================================================');
console.log('MI NEGOCIO PRO 360 — SUITE MAESTRA DE REGRESIÓN (FASES 0 A 9)');
console.log('======================================================================\n');

let passedSuites = 0;
for (const suite of suites) {
  const fullPath = path.resolve(process.cwd(), suite);
  console.log(`>>> Ejecutando ${suite}...`);
  const res = spawnSync(nodeBin, ['--experimental-strip-types', fullPath], {
    stdio: 'inherit',
  });
  if (res.status !== 0) {
    console.error(`\n✖ FALLÓ la suite: ${suite} (código ${res.status})`);
    process.exit(res.status ?? 1);
  }
  passedSuites += 1;
  console.log('');
}

console.log('======================================================================');
console.log(`✔ TODAS LAS SUITES SUPERADAS: ${passedSuites}/${suites.length} EXITOSAS`);
console.log('======================================================================');
