import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32; // 256 bits

function getEncryptionKey(): Buffer {
  const key = process.env.ENCRYPTION_KEY;
  if (!key) throw new Error('ENCRYPTION_KEY env var is required');
  // Accept hex-encoded 32-byte key
  const buf = Buffer.from(key, 'hex');
  if (buf.length !== KEY_LENGTH) {
    throw new Error(`ENCRYPTION_KEY must be a 64-char hex string (32 bytes). Got ${buf.length} bytes.`);
  }
  return buf;
}

export function encrypt(plaintext: string): { encrypted: string; iv: string } {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(12); // 96-bit IV for GCM
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv) as crypto.CipherGCM;
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  // Store encrypted + authTag together (last 16 bytes are tag)
  const combined = Buffer.concat([encrypted, authTag]);
  return {
    encrypted: combined.toString('hex'),
    iv: iv.toString('hex'),
  };
}

export function decrypt(encryptedHex: string, ivHex: string): string {
  const key = getEncryptionKey();
  const iv = Buffer.from(ivHex, 'hex');
  const combined = Buffer.from(encryptedHex, 'hex');
  // Last 16 bytes are the auth tag
  const authTag = combined.subarray(combined.length - 16);
  const encrypted = combined.subarray(0, combined.length - 16);
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv) as crypto.DecipherGCM;
  decipher.setAuthTag(authTag);
  return decipher.update(encrypted) + decipher.final('utf8');
}
