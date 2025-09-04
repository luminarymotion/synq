import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('🔐 Generating SSL certificates for local HTTPS development...');

try {
  // Check if certificates already exist
  const keyPath = path.join(__dirname, 'localhost-key.pem');
  const certPath = path.join(__dirname, 'localhost.pem');
  
  if (fs.existsSync(keyPath) && fs.existsSync(certPath)) {
    console.log('✅ SSL certificates already exist');
    process.exit(0);
  }

  // Generate self-signed certificate using OpenSSL
  console.log('📝 Creating self-signed certificate...');
  
  // Generate private key
  execSync('openssl genrsa -out localhost-key.pem 2048', { cwd: __dirname, stdio: 'inherit' });
  
  // Generate certificate
  execSync('openssl req -new -x509 -key localhost-key.pem -out localhost.pem -days 365 -subj "/C=US/ST=State/L=City/O=Organization/CN=localhost"', { 
    cwd: __dirname, 
    stdio: 'inherit' 
  });

  console.log('✅ SSL certificates generated successfully!');
  console.log('🔒 You can now run the development server with HTTPS');
  console.log('📱 iOS Safari geolocation should now work properly');
  
} catch (error) {
  console.error('❌ Failed to generate SSL certificates:', error.message);
  console.log('💡 Alternative: Install mkcert for easier certificate management');
  console.log('   npm install -g mkcert');
  console.log('   mkcert -install');
  console.log('   mkcert localhost 127.0.0.1 ::1');
  process.exit(1);
} 