const twilio = require('twilio');
const { getUsuarioPorTelefono, registrarUsuario, insertarRecordatorio } = require('../db');
const {
  getActividadesCacheadas,
  getActividadPorIndice,
  invalidarCache,
  marcarCompletada,
  marcarPospuesta,
  getDetalleActividad,
  formatearActividades,
} = require('../services/notion');
const { enviarWhatsApp } = require('../services/twilio');
const logger             = require('../utils/logger');

// ─── Validación de firma Twilio (R3) ─────────────────────
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

// ─── Auto-registro ────────────────────────────────────────
// Flujo: usuario desconocido envía "registrar [db_id]"
// El token de Notion se toma del env global (NOTION_TOKEN)
const UUID_REGEX = /^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$/i;

async function manejarRegistro(telefono, entrada) {
  const partes = entrada.trim().split(/\s+/);

  if (partes[0] !== 'registrar') return false;

  if (partes.length < 2) {
    await enviarWhatsApp(telefono,
      `📋 *Registro*\n\n` +
      `Envía tu ID de base de datos de Notion:\n` +
      `*registrar [db_id]*\n\n` +
      `_El DB ID lo encuentras en la URL de tu base de datos Notion:_\n` +
      `notion.so/Mi-Base-*1a2b3c4d...*`
    );
    return true;
  }

  const dbId = partes[1].replace(/-/g, '');
  if (!UUID_REGEX.test(partes[1]) && dbId.length !== 32) {
    await enviarWhatsApp(telefono,
      `❌ El ID no tiene el formato correcto.\n` +
      `Debe ser el UUID de tu base de datos Notion.\n\n` +
      `Ejemplo: _1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d_`
    );
    return true;
  }

  if (!process.env.NOTION_TOKEN) {
    logger.error('NOTION_TOKEN no configurado — no se puede auto-registrar');
    await enviarWhatsApp(telefono, '⚠️ El sistema no está configurado para registro automático. Contacta al administrador.');
    return true;
  }

  const nombre = `Usuario ${telefono.slice(-4)}`;
  await registrarUsuario({ nombre, telefono, notion_db_id: partes[1] });
  logger.info('Usuario auto-registrado', { telefono, notion_db_id: partes[1] });

  await enviarWhatsApp(telefono,
    `✅ *¡Registrado exitosamente!*\n\n` +
    `Ya puedes usar el bot. Envía *ayuda* para ver los comandos disponibles.\n\n` +
    `_Asegúrate de que tu integración de Notion tenga acceso a tu base de datos._`
  );
  return true;
}

async function webhookHandler(req, res) {
  res.sendStatus(200);

  const { Body, From } = req.body;
  if (!Body || !From) return;

  const telefono = From.replace('whatsapp:', '');
  const entrada  = Body.trim().toLowerCase();

  logger.info('Mensaje recibido', { telefono, comando: entrada });

  // Permitir registrar antes de verificar si el usuario existe
  if (entrada.startsWith('registrar')) {
    await manejarRegistro(telefono, entrada);
    return;
  }

  const usuario = await getUsuarioPorTelefono(telefono);
  if (!usuario) {
    logger.warn('Usuario no registrado', { telefono });
    await enviarWhatsApp(telefono,
      `❌ Tu número no está registrado.\n\n` +
      `Para registrarte envía:\n*registrar [id_de_tu_base_notion]*\n\n` +
      `_Ejemplo: registrar 1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d_`
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
      invalidarCache(telefono);
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
      const nombre   = actividad.properties?.Nombre?.title?.[0]?.plain_text || 'actividad';
      const enviarEn = new Date(Date.now() + 2 * 60 * 60 * 1000);

      await marcarPospuesta(usuario.notion_token, actividad.id);
      invalidarCache(telefono);
      await insertarRecordatorio({ telefono, actividad_id: actividad.id, nombre, enviarEn });
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
      const nombre  = actividad.properties?.Nombre?.title?.[0]?.plain_text || 'actividad';
      const pct     = actividad.properties?.Porcentaje?.number != null
        ? Math.round(actividad.properties.Porcentaje.number * 100) + '%'
        : '?%';
      const tipo     = actividad.properties?.Tipo?.select?.name || '';
      const fecha    = actividad.properties?.Fecha?.date?.start || 'sin fecha';
      const detalle  = await getDetalleActividad(usuario.notion_token, actividad.id);
      const semana   = detalle.semana ? `Semana ${detalle.semana}` : '';
      const materia  = detalle.materia || '';
      const categoria = detalle.categoria || '';

      const meta = [pct, tipo, categoria, fecha, semana].filter(Boolean).join('  |  ');
      const respuesta = [
        `📖 *${nombre}*`,
        materia ? `📘 ${materia}` : '',
        meta,
        '',
        detalle.temas ? `*Temas:*\n${detalle.temas}` : '_Sin temas registrados en Notion._',
      ].filter(l => l !== '').join('\n');

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
