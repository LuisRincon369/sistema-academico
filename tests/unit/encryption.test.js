// Tests de utils/encryption.js — no requieren BD ni servicios externos
process.env.ENCRYPTION_KEY = 'a'.repeat(64); // clave de 32 bytes en hex para los tests

const { encrypt, decrypt, isEncrypted } = require('../../utils/encryption');

describe('encryption', () => {
  test('encrypt produce un string con prefijo enc:', () => {
    const result = encrypt('mi_token_secreto');
    expect(result).toMatch(/^enc:/);
  });

  test('decrypt recupera el texto original', () => {
    const original = 'secret_notion_token_abc123';
    expect(decrypt(encrypt(original))).toBe(original);
  });

  test('cada llamada a encrypt produce un valor diferente (IV aleatorio)', () => {
    const token = 'mismo_token';
    expect(encrypt(token)).not.toBe(encrypt(token));
  });

  test('decrypt devuelve texto plano sin modificar si no tiene prefijo enc:', () => {
    const plano = 'token_sin_cifrar';
    expect(decrypt(plano)).toBe(plano);
  });

  test('isEncrypted detecta valores cifrados correctamente', () => {
    expect(isEncrypted(encrypt('algo'))).toBe(true);
    expect(isEncrypted('texto_plano')).toBe(false);
    expect(isEncrypted('')).toBe(false);
    expect(isEncrypted(null)).toBe(false);
  });

  test('encrypt lanza error si ENCRYPTION_KEY no está configurada', () => {
    const original = process.env.ENCRYPTION_KEY;
    delete process.env.ENCRYPTION_KEY;
    expect(() => encrypt('test')).toThrow('ENCRYPTION_KEY');
    process.env.ENCRYPTION_KEY = original;
  });

  test('encrypt lanza error si ENCRYPTION_KEY tiene longitud incorrecta', () => {
    process.env.ENCRYPTION_KEY = 'corta';
    expect(() => encrypt('test')).toThrow('64 caracteres');
    process.env.ENCRYPTION_KEY = 'a'.repeat(64);
  });
});
