require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const { encrypt, decrypt } = require('./utils/encryption');

const prisma = new PrismaClient();

// Resuelve el token de Notion: usa el individual si existe, si no el global de env
function resolverToken(notionToken) {
  if (notionToken) return decrypt(notionToken);
  const global = process.env.NOTION_TOKEN;
  if (!global) throw new Error('NOTION_TOKEN no configurado en variables de entorno');
  return global;
}

function toUsuario(row) {
  if (!row) return null;
  return {
    id:           row.id,
    nombre:       row.nombre,
    telefono:     row.telefono,
    notion_token: resolverToken(row.notionToken),
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

// notion_token es opcional — si no se pasa, se usará NOTION_TOKEN global en runtime
async function registrarUsuario({ nombre, telefono, notion_db_id, notion_token }) {
  const tokenCifrado = notion_token ? encrypt(notion_token) : null;
  const row = await prisma.usuario.upsert({
    where:  { telefono },
    update: { notionDbId: notion_db_id, ...(tokenCifrado && { notionToken: tokenCifrado }) },
    create: { nombre, telefono, notionDbId: notion_db_id, notionToken: tokenCifrado },
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
