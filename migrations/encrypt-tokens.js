// Migración única: cifra los notion_token que aún estén en texto plano en la tabla usuarios.
// Ejecutar UNA vez después de configurar ENCRYPTION_KEY en el entorno:
//   node migrations/encrypt-tokens.js
require('dotenv').config();

const { prisma }               = require('../db');
const { encrypt, isEncrypted } = require('../utils/encryption');

async function migrar() {
  console.log('Iniciando migración de tokens...');

  if (!process.env.ENCRYPTION_KEY) {
    console.error('ERROR: ENCRYPTION_KEY no está configurada en .env');
    process.exit(1);
  }

  const usuarios = await prisma.usuario.findMany({
    select: { id: true, nombre: true, notionToken: true },
  });
  console.log(`Usuarios encontrados: ${usuarios.length}`);

  let migrados = 0;
  let omitidos = 0;

  for (const u of usuarios) {
    if (isEncrypted(u.notionToken)) {
      console.log(`  ⏭  ${u.nombre} — ya cifrado, omitido`);
      omitidos++;
      continue;
    }

    await prisma.usuario.update({
      where: { id: u.id },
      data:  { notionToken: encrypt(u.notionToken) },
    });
    console.log(`  ✅ ${u.nombre} — token cifrado`);
    migrados++;
  }

  console.log(`\nMigración completada: ${migrados} cifrado(s), ${omitidos} omitido(s)`);
  await prisma.$disconnect();
}

migrar().catch(err => {
  console.error('Error en migración:', err.message);
  process.exit(1);
});
