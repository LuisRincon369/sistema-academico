// Migración única: cifra los notion_token que aún estén en texto plano en la tabla usuarios.
// Ejecutar UNA vez después de configurar ENCRYPTION_KEY en el entorno:
//   node migrations/encrypt-tokens.js
require('dotenv').config();

const { pool }                   = require('../db');
const { encrypt, isEncrypted }   = require('../utils/encryption');

async function migrar() {
  console.log('Iniciando migración de tokens...');

  if (!process.env.ENCRYPTION_KEY) {
    console.error('ERROR: ENCRYPTION_KEY no está configurada en .env');
    process.exit(1);
  }

  const { rows } = await pool.query('SELECT id, nombre, notion_token FROM usuarios');
  console.log(`Usuarios encontrados: ${rows.length}`);

  let migrados = 0;
  let omitidos = 0;

  for (const row of rows) {
    if (isEncrypted(row.notion_token)) {
      console.log(`  ⏭  ${row.nombre} — ya cifrado, omitido`);
      omitidos++;
      continue;
    }

    const tokenCifrado = encrypt(row.notion_token);
    await pool.query(
      'UPDATE usuarios SET notion_token = $1 WHERE id = $2',
      [tokenCifrado, row.id]
    );
    console.log(`  ✅ ${row.nombre} — token cifrado`);
    migrados++;
  }

  console.log(`\nMigración completada: ${migrados} cifrado(s), ${omitidos} omitido(s)`);
  await pool.end();
}

migrar().catch(err => {
  console.error('Error en migración:', err.message);
  process.exit(1);
});
