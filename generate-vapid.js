const webpush = require('web-push');
const fs = require('fs');
const path = require('path');

const vapidKeys = webpush.generateVAPIDKeys();

const backendEnvPath = path.join(__dirname, '..', 'backend', '.env');
const frontendEnvPath = path.join(__dirname, '..', 'frontend', '.env.local');

console.log('Generated VAPID Keys:');
console.log('Public:', vapidKeys.publicKey);
console.log('Private:', vapidKeys.privateKey);

// Append to backend .env
let backendEnv = fs.existsSync(backendEnvPath) ? fs.readFileSync(backendEnvPath, 'utf8') : '';
if (!backendEnv.includes('VAPID_PUBLIC_KEY')) {
  backendEnv += `\n\n# Web Push VAPID Keys\nVAPID_PUBLIC_KEY=${vapidKeys.publicKey}\nVAPID_PRIVATE_KEY=${vapidKeys.privateKey}\nVAPID_SUBJECT=mailto:support@luxuryland.com\n`;
  fs.writeFileSync(backendEnvPath, backendEnv);
  console.log('Appended to backend .env');
}

// Append to frontend .env.local
let frontendEnv = fs.existsSync(frontendEnvPath) ? fs.readFileSync(frontendEnvPath, 'utf8') : '';
if (!frontendEnv.includes('NEXT_PUBLIC_VAPID_PUBLIC_KEY')) {
  frontendEnv += `\n\n# Web Push VAPID Public Key\nNEXT_PUBLIC_VAPID_PUBLIC_KEY=${vapidKeys.publicKey}\n`;
  fs.writeFileSync(frontendEnvPath, frontendEnv);
  console.log('Appended to frontend .env.local');
}
