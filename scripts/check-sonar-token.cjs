const token = process.env.SONARQUBE_TOKEN || process.env.SONAR_TOKEN;
if (!token) {
  console.error('Error: SONARQUBE_TOKEN environment variable must be set.');
  console.error('Set it temporarily in PowerShell: $env:SONARQUBE_TOKEN = "<token>"');
  console.error('Or set it permanently: setx SONARQUBE_TOKEN "<token>"');
  console.error('You can also copy .env.example -> .env and fill the value.');
  process.exit(1);
}

console.log('SONARQUBE_TOKEN found — ready to run sonar-scanner.');
process.exit(0);
