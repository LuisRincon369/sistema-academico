const { getUsuarios, getRecordatoriosPendientes, marcarRecordatorioEnviado } = require('../db');
const { getActividadesProximas, formatearActividades } = require('./notion');
const { enviarWhatsApp } = require('./twilio');
const logger             = require('../utils/logger');

async function revisarFechas() {
  logger.info('Cron revisarFechas iniciado');

  let usuarios;
  try {
    usuarios = await getUsuarios();
  } catch (err) {
    logger.error('Error obteniendo usuarios', { error: err.message });
    return;
  }

  logger.info('Usuarios activos', { total: usuarios.length });

  for (const usuario of usuarios) {
    try {
      const actividades = await getActividadesProximas(
        usuario.notion_token,
        usuario.notion_db_id,
        7
      );

      if (!actividades.length) {
        logger.info('Sin actividades próximas', { usuario: usuario.nombre });
        continue;
      }

      // Solo alerta si hay actividades con fecha <= 3 días
      const urgentes = actividades.filter(a => {
        const fecha = a.properties?.Fecha?.date?.start;
        if (!fecha) return false;
        const dias = Math.ceil((new Date(fecha + 'T12:00:00') - new Date()) / 86400000);
        return dias <= 3;
      });

      if (!urgentes.length) {
        logger.info('Sin actividades urgentes hoy', { usuario: usuario.nombre, total: actividades.length });
        continue;
      }

      const mensaje = formatearActividades(actividades);
      if (mensaje) {
        await enviarWhatsApp(usuario.telefono, mensaje);
        logger.info('Alerta enviada', { usuario: usuario.nombre, actividades: actividades.length });
      }

    } catch (err) {
      logger.error('Error procesando usuario', { usuario: usuario.nombre, error: err.message });
    }
  }

  logger.info('Cron revisarFechas completado');
}

// ─── R1: Procesar recordatorios pendientes ───────────────
// Corre cada 15 min. Envía los recordatorios de "posponer" que sobrevivieron reinicios.
async function procesarRecordatorios() {
  let pendientes;
  try {
    pendientes = await getRecordatoriosPendientes();
  } catch (err) {
    logger.error('Error obteniendo recordatorios', { error: err.message });
    return;
  }

  if (!pendientes.length) return;

  logger.info('Recordatorios pendientes', { total: pendientes.length });

  for (const rec of pendientes) {
    try {
      await enviarWhatsApp(
        rec.telefono,
        `🔔 Recordatorio pospuesto:\n\n*${rec.nombre}*\nNo olvides completarla.`
      );
      await marcarRecordatorioEnviado(rec.id);
      logger.info('Recordatorio enviado', { telefono: rec.telefono, nombre: rec.nombre });
    } catch (err) {
      logger.error('Error enviando recordatorio', { id: rec.id, error: err.message });
    }
  }
}

module.exports = { revisarFechas, procesarRecordatorios };
