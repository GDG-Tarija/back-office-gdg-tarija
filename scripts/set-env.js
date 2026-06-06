const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, '../src/environments');

function toTsString(value) {
  const escaped = String(value || '')
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\r/g, '\\r')
    .replace(/\n/g, '\\n');

  return `'${escaped}'`;
}

if (!fs.existsSync(dir)) {
  fs.mkdirSync(dir, { recursive: true });
}

const devFilePath = path.join(dir, 'environment.ts');
const prodFilePath = path.join(dir, 'environment.prod.ts');
const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_KEY || process.env.SUPABASE_ANON_KEY || '';

const hasEnvVars = supabaseUrl && supabaseKey;

// Para environment.ts (desarrollo local)
if (hasEnvVars) {
  const devContent = `export const environment = {
  production: false,
  supabaseUrl: ${toTsString(supabaseUrl)},
  supabaseKey: ${toTsString(supabaseKey)},
};
`;
  fs.writeFileSync(devFilePath, devContent, 'utf8');
  console.log('[scripts/set-env.js] src/environments/environment.ts generado exitosamente.');
} else {
  if (!fs.existsSync(devFilePath)) {
    const devContent = `export const environment = {
  production: false,
  supabaseUrl: 'https://example.supabase.co',
  supabaseKey: 'dummy-key',
};
`;
    fs.writeFileSync(devFilePath, devContent, 'utf8');
  }
}

// Para environment.prod.ts (producción)
if (hasEnvVars) {
  const prodContent = `export const environment = {
  production: true,
  supabaseUrl: ${toTsString(supabaseUrl)},
  supabaseKey: ${toTsString(supabaseKey)},
};
`;
  fs.writeFileSync(prodFilePath, prodContent, 'utf8');
  console.log('[scripts/set-env.js] src/environments/environment.prod.ts generado exitosamente.');
} else {
  if (!fs.existsSync(prodFilePath)) {
    const prodContent = `export const environment = {
  production: true,
  supabaseUrl: 'https://example.supabase.co',
  supabaseKey: 'dummy-key',
};
`;
    fs.writeFileSync(prodFilePath, prodContent, 'utf8');
  }
}
