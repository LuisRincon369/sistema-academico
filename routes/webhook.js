const twilio = require('twilio');
const { getUsuarioPorTelefono }  = require('../db');
const { insertarRecordatorio }   = require('../db');
const {
  getActividadesCacheadas,
  getActividadPorIndice,
  invalidarCache,
  marcarCompletada,
  marcarPospuesta,
  getTemas,
  formatearActividades,
} = require('../services/notion');
const { enviarWhatsApp } = require('../services/twilio');
const logger             = require('../utils/logger');

// ─── R3: Validación de firma Twilio ──────────────────────
// En producción rechaza requests que no vengan de Twilio.
// En desarrollo se omite para facilitar pruebas locales.
function validarFirmaTwilio(req, res, next) {
  if (process.env.NODE_ENV !== 'production') return next();

  const firma = req.headers['x-twilio-signature'];
  const url   = process.env.WEBHOOK_URL;

  if (!url) {
    logger.warn('WEBHOOK_URL no configurada — omitiendo validación de firma');
    return next();
  }

  const valido = twilio.validateRequest(
    process.env.TWILIO_AUTH_TOKEN,
    firma,
    url,
    req.body
  );

  if (!valido) {
    logger.warn('Firma Twilio inválida', { ip: req.ip });
    return res.status(403).json({ error: 'Firma inválida' });
  }

  next();
}

async function webhookHandler(req, res) {
  // Twilio requiere 200 inmediato; la lógica corre de forma asíncrona
  res.sendStatus(200);

  const { Body, From } = req.body;
  if (!Body || !From) return;

  const telefono = From.replace('whatsapp:', '');
  const entrada  = Body.trim().toLowerCase();

  logger.info('Mensaje recibido', { telefono, comando: entrada });

  const usuario = await getUsuarioPorTelefono(telefono);
  if (!usuario) {
    logger.warn('Usuario no registrado', { telefono });
    await enviarWhatsApp(telefono,
      '❌ Tu número no está registrado en el sistema.\nContacta al administrador para registrarte.'
    );
    return;
  }

  try {
    // ─── semana ───────────────────────────────────────────
    if (entrada === 'semana') {
      const actividades = await getActividadesCacheadas(
        usuario.notion_token, usuario.notion_db_id, telefono, 7
      );
      if (!actividades.length) {
        await enviarWhatsApp(telefono, '✅ No tienes actividades pendientes esta semana. ¡A descansar!');
        return;
      }
      await enviarWhatsApp(telefono, formatearActividades(actividades));
    }

    // ─── listo N ──────────────────────────────────────────
    else if (entrada.startsWith('listo')) {
      const idx      = parseInt(entrada.split(/\s+/)[1] || '1', 10) - 1;
      const actividad = await getActividadPorIndice(
        usuario.notion_token, usuario.notion_db_id, telefono, idx
      );
      if (!actividad) {
        await enviarWhatsApp(telefono, `❌ No encontré la actividad ${idx + 1}. Envía *semana* para ver la lista.`);
        return;
      }
      const nombre = actividad.properties?.Nombre?.title?.[0]?.plain_text || 'actividad';
      await marcarCompletada(usuario.notion_token, actividad.id);
      invalidarCache(telefono); // la lista cambió — forzar recarga
      await enviarWhatsApp(telefono, `✅ *${nombre}* marcada como completada en Notion.`);
    }

    // ─── posponer N ───────────────────────────────────────
    else if (entrada.startsWith('posponer')) {
      const idx      = parseInt(entrada.split(/\s+/)[1] || '1', 10) - 1;
      const actividad = await getActividadPorIndice(
        usuario.notion_token, usuario.notion_db_id, telefono, idx
      );
      if (!actividad) {
        await enviarWhatsApp(telefono, `❌ No encontré la actividad ${idx + 1}. Envía *semana* para ver la lista.`);
        return;
      }
      const nombre    = actividad.properties?.Nombre?.title?.[0]?.plain_text || 'actividad';
      const enviarEn  = new Date(Date.now() + 2 * 60 * 60 * 1000); // ahora + 2 horas

      // R4: actualizar estado en Notion
      await marcarPospuesta(usuario.notion_token, actividad.id);
      invalidarCache(telefono);

      // R1: persistir el recordatorio en BD (sobrevive reinicios)
      await insertarRecordatorio({
        telefono,
        actividad_id: actividad.id,
        nombre,
        enviarEn,
      });

      await enviarWhatsApp(telefono, `⏰ Te recuerdo *${nombre}* en 2 horas.`);
      logger.info('Recordatorio programado', { telefono, nombre, enviarEn });
    }

    // ─── info N ───────────────────────────────────────────
    else if (entrada.startsWith('info')) {
      const idx      = parseInt(entrada.split(/\s+/)[1] || '1', 10) - 1;
      const actividad = await getActividadPorIndice(
        usuario.notion_token, usuario.notion_db_id, telefono, idx
      );
      if (!actividad) {
        await enviarWhatsApp(telefono, `❌ No encontré la actividad ${idx + 1}. Envía *semana* para ver la lista.`);
        return;
      }
      const nombre = actividad.properties?.Nombre?.title?.[0]?.plain_text || 'actividad';
      const temas  = await getTemas(usuario.notion_token, actividad.id);
      const pct    = actividad.properties?.Porcentaje?.number != null
        ? Math.round(actividad.properties.Porcentaje.number * 100) + '%'
        : '?%';
      const tipo   = actividad.properties?.Tipo?.select?.name || '';
      const fecha  = actividad.properties?.Fecha?.date?.start || 'sin fecha';

      const respuesta = temas
        ? `📖 *${nombre}*\n📊 ${pct}  |  🏷 ${tipo}  |  📅 ${fecha}\n\n*Temas:*\n${temas}`
        : `📖 *${nombre}*\n📊 ${pct}  |  🏷 ${tipo}  |  📅 ${fecha}\n\n_Sin temas registrados en Notion._`;

      await enviarWhatsApp(telefono, respuesta);
    }

    // ─── ayuda ────────────────────────────────────────────
    else if (entrada === 'ayuda' || entrada === 'help') {
      await enviarWhatsApp(telefono,
        `🤖 *Comandos disponibles:*\n\n` +
        `📋 *semana* — ver actividades de los próximos 7 días\n` +
        `✅ *listo N* — marcar actividad N como completada\n` +
        `⏰ *posponer N* — recordar actividad N en 2 horas\n` +
        `📖 *info N* — ver temas de la actividad N\n\n` +
        `_Ejemplo: "listo 2" marca la actividad 2 como completada_`
      );
    }

    // ─── comando desconocido ──────────────────────────────
    else {
      await enviarWhatsApp(telefono,
        `❓ Comando no reconocido: _${Body.trim()}_\n\nEnvía *ayuda* para ver los comandos disponibles.`
      );
    }

  } catch (err) {
    logger.error('Error en webhook', { telefono, error: err.message });
    await enviarWhatsApp(telefono, '⚠️ Ocurrió un error procesando tu comando. Intenta de nuevo.');
  }
}

module.exports = { webhookHandler, validarFirmaTwilio };
