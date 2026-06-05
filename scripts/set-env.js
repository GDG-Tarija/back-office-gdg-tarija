const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, '../src/environments');
const envFilePath = path.join(__dirname, '../.env');

function loadLocalEnv() {
  if (!fs.existsSync(envFilePath)) return;

  const lines = fs.readFileSync(envFilePath, 'utf8').split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const separatorIndex = trimmed.indexOf('=');
    if (separatorIndex === -1) continue;

    const key = trimmed.slice(0, separatorIndex).trim();
    const rawValue = trimmed.slice(separatorIndex + 1).trim();
    const value = rawValue.replace(/^['"]|['"]$/g, '');

    if (!process.env[key]) process.env[key] = value;
  }
}

function toTsString(value) {
  const escaped = String(value || '')
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\r/g, '\\r')
    .replace(/\n/g, '\\n');

  return `'${escaped}'`;
}

loadLocalEnv();

if (!fs.existsSync(dir)) {
  fs.mkdirSync(dir, { recursive: true });
}

const devFilePath = path.join(dir, 'environment.ts');
const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_KEY || process.env.SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseKey) {
  console.error(
    [
      '[scripts/set-env.js] Faltan variables de Supabase.',
      'Crea un archivo .env en la raíz o define variables de entorno:',
      'SUPABASE_URL=...',
      'SUPABASE_KEY=...',
    ].join('\n'),
  );
  process.exit(1);
}

const devContent = `export const environment = {
  production: false,
  supabaseUrl: ${toTsString(supabaseUrl)},
  supabaseKey: ${toTsString(supabaseKey)},
};
`;

fs.writeFileSync(devFilePath, devContent, 'utf8');
console.log('[scripts/set-env.js] src/environments/environment.ts generado exitosamente.');

const prodFilePath = path.join(dir, 'environment.prod.ts');
const prodContent = `export const environment = {
  production: true,
  supabaseUrl: ${toTsString(supabaseUrl)},
  supabaseKey: ${toTsString(supabaseKey)},
};
`;

fs.writeFileSync(prodFilePath, prodContent, 'utf8');
console.log('[scripts/set-env.js] src/environments/environment.prod.ts generado exitosamente.');
