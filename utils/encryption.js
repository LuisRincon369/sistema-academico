// Cifrado AES-256-CBC para campos sensibles en BD (notion_token)
// Los valores cifrados llevan prefijo "enc:" para distinguirlos de texto plano (sin migrar)
const crypto = require('crypto');

const ALGO   = 'aes-256-cbc';
const PREFIX = 'enc:';

function getKey() {
  const raw = process.env.ENCRYPTION_KEY;
  if (!raw) throw new Error('Variable ENCRYPTION_KEY no configurada');
  const key = Buffer.from(raw, 'hex');
  if (key.length !== 32) throw new Error('ENCRYPTION_KEY debe tener exactamente 64 caracteres hex (32 bytes)');
  return key;
}

function encrypt(text) {
  const iv        = crypto.randomBytes(16);
  const cipher    = crypto.createCipheriv(ALGO, getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  return PREFIX + iv.toString('hex') + ':' + encrypted.toString('hex');
}

// Si el valor no tiene el prefijo "enc:" lo retorna sin cambios (compatibilidad con datos sin migrar)
function decrypt(value) {
  if (!value || !value.startsWith(PREFIX)) return value;
  const rest      = value.slice(PREFIX.length);
  const colonIdx  = rest.indexOf(':');
  const iv        = Buffer.from(rest.slice(0, colonIdx), 'hex');
  const encrypted = Buffer.from(rest.slice(colonIdx + 1), 'hex');
  const decipher  = crypto.createDecipheriv(ALGO, getKey(), iv);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}

function isEncrypted(value) {
  return typeof value === 'string' && value.startsWith(PREFIX);
}

module.exports = { encrypt, decrypt, isEncrypted };
