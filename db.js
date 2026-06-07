require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const { encrypt, decrypt } = require('./utils/encryption');

const prisma = new PrismaClient();

// ─── Mapeo Prisma (camelCase) → snake_case ────────────────
// Permite que el resto del código use usuario.notion_token / notion_db_id sin cambios
function toUsuario(row) {
  if (!row) return null;
  return {
    id:           row.id,
    nombre:       row.nombre,
    telefono:     row.telefono,
    notion_token: decrypt(row.notionToken),
    notion_db_id: row.notionDbId,
    activo:       row.activo,
    creado_en:    row.creadoEn,
  };
}

// ─── Usuarios ────────────────────────────────────────────

async function getUsuarios() {
  const rows = await prisma.usuario.findMany({ where: { activo: true } });
  return rows.map(toUsuario);
}

async function getUsuarioPorTelefono(telefono) {
  const row = await prisma.usuario.findUnique({ where: { telefono } });
  return toUsuario(row);
}

async function registrarUsuario({ nombre, telefono, notion_token, notion_db_id }) {
  const tokenCifrado = encrypt(notion_token);
  const row = await prisma.usuario.upsert({
    where:  { telefono },
    update: { notionToken: tokenCifrado, notionDbId: notion_db_id },
    create: { nombre, telefono, notionToken: tokenCifrado, notionDbId: notion_db_id },
  });
  return toUsuario(row);
}

// ─── Recordatorios ───────────────────────────────────────

async function insertarRecordatorio({ telefono, actividad_id, nombre, enviarEn }) {
  return prisma.recordatorio.create({
    data: { telefono, actividadId: actividad_id, nombre, enviarEn },
  });
}

async function getRecordatoriosPendientes() {
  return prisma.recordatorio.findMany({
    where:   { enviado: false, enviarEn: { lte: new Date() } },
    orderBy: { enviarEn: 'asc' },
  });
}

async function marcarRecordatorioEnviado(id) {
  await prisma.recordatorio.update({
    where: { id },
    data:  { enviado: true },
  });
}

module.exports = {
  prisma,
  getUsuarios,
  getUsuarioPorTelefono,
  registrarUsuario,
  insertarRecordatorio,
  getRecordatoriosPendientes,
  marcarRecordatorioEnviado,
};
