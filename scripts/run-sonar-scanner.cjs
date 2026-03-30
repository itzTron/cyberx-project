const { spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');

// Load .env file if present (simple parser, no external deps)
const dotenvPath = path.join(process.cwd(), '.env');
if (fs.existsSync(dotenvPath)) {
  const envContent = fs.readFileSync(dotenvPath, 'utf8');
  envContent.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const idx = trimmed.indexOf('=');
    if (idx === -1) return;
    const key = trimmed.slice(0, idx).trim();
    let val = trimmed.slice(idx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith('\'') && val.endsWith('\''))) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  });
}

const token = process.env.SONARQUBE_TOKEN || process.env.SONAR_TOKEN;
if (!token) {
  console.error('Error: SONARQUBE_TOKEN environment variable must be set.');
  console.error('Set it temporarily in PowerShell: $env:SONARQUBE_TOKEN = "<token>"');
  console.error('Or set it permanently: setx SONARQUBE_TOKEN "<token>"');
  process.exit(1);
}

const host = process.env.SONARQUBE_URL || process.env.SONAR_HOST_URL || 'http://localhost:9000';

const args = [`-Dsonar.login=${token}`, `-Dsonar.host.url=${host}`];

console.log('Running sonar-scanner with the provided token...');

// Try local sonar-scanner first
let res = spawnSync('sonar-scanner', args, { stdio: 'inherit', shell: true });
if (res.error && res.error.code === 'ENOENT') {
  console.warn('sonar-scanner not found in PATH; falling back to Docker image.');

  const dockerArgs = [
    'run', '--rm',
    '-v', `${process.cwd()}:/usr/src`,
    '-w', '/usr/src',
    'sonarsource/sonar-scanner-cli:latest',
    'sonar-scanner',
    `-Dsonar.login=${token}`,
    `-Dsonar.host.url=${host}`,
  ];

  res = spawnSync('docker', dockerArgs, { stdio: 'inherit', shell: true });
  if (res.error && res.error.code === 'ENOENT') {
    console.error('Docker not found. Install Docker or install sonar-scanner CLI.');
    process.exit(2);
  }
}

process.exit(res.status === null ? 1 : res.status);
