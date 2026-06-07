require('dotenv').config();
const { Pool }               = require('pg');
const { encrypt, decrypt }   = require('./utils/encryption');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

// ─── Usuarios ────────────────────────────────────────────

function decryptUsuario(row) {
  if (!row) return null;
  return { ...row, notion_token: decrypt(row.notion_token) };
}

async function getUsuarios() {
  const res = await pool.query('SELECT * FROM usuarios WHERE activo = true');
  return res.rows.map(decryptUsuario);
}

async function getUsuarioPorTelefono(telefono) {
  const res = await pool.query(
    'SELECT * FROM usuarios WHERE telefono = $1',
    [telefono]
  );
  return decryptUsuario(res.rows[0] || null);
}

async function registrarUsuario({ nombre, telefono, notion_token, notion_db_id }) {
  const tokenCifrado = encrypt(notion_token);
  const res = await pool.query(
    `INSERT INTO usuarios (nombre, telefono, notion_token, notion_db_id)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (telefono) DO UPDATE
     SET notion_token = $3, notion_db_id = $4
     RETURNING *`,
    [nombre, telefono, tokenCifrado, notion_db_id]
  );
  return decryptUsuario(res.rows[0]);
}

// ─── Recordatorios ───────────────────────────────────────

async function insertarRecordatorio({ telefono, actividad_id, nombre, enviarEn }) {
  const res = await pool.query(
    `INSERT INTO recordatorios (telefono, actividad_id, nombre, enviar_en)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT DO NOTHING
     RETURNING *`,
    [telefono, actividad_id, nombre, enviarEn]
  );
  return res.rows[0];
}

async function getRecordatoriosPendientes() {
  const res = await pool.query(
    `SELECT * FROM recordatorios
     WHERE enviado = false AND enviar_en <= NOW()
     ORDER BY enviar_en ASC`
  );
  return res.rows;
}

async function marcarRecordatorioEnviado(id) {
  await pool.query(
    'UPDATE recordatorios SET enviado = true WHERE id = $1',
    [id]
  );
}

module.exports = {
  pool,
  getUsuarios,
  getUsuarioPorTelefono,
  registrarUsuario,
  insertarRecordatorio,
  getRecordatoriosPendientes,
  marcarRecordatorioEnviado,
};
