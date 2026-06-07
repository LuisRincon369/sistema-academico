require('dotenv').config();
const express  = require('express');
const cron     = require('node-cron');
const { revisarFechas, procesarRecordatorios } = require('./services/cron');
const { webhookHandler, validarFirmaTwilio }   = require('./routes/webhook');
const logger   = require('./utils/logger');

const app  = express();
const PORT = process.env.PORT || 3000;

// ─── Middleware ───────────────────────────────────────────
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

// ─── Rutas ────────────────────────────────────────────────
app.get('/', (req, res) => {
  res.json({ status: 'ok', service: 'Sistema Académico IUE', timestamp: new Date().toISOString() });
});

// R3: validarFirmaTwilio corre antes del handler (solo en producción)
app.post('/webhook/whatsapp', validarFirmaTwilio, webhookHandler);

// ─── Cron jobs ────────────────────────────────────────────
// Alertas diarias: 7am y 6pm hora Colombia
cron.schedule('0 12 * * *', async () => {
  logger.info('Cron matutino activado');
  await revisarFechas();
}, { timezone: 'America/Bogota' });

cron.schedule('0 23 * * *', async () => {
  logger.info('Cron vespertino activado');
  await revisarFechas();
}, { timezone: 'America/Bogota' });

// R1: Procesar recordatorios de "posponer" cada 15 min
cron.schedule('*/15 * * * *', async () => {
  await procesarRecordatorios();
}, { timezone: 'America/Bogota' });

// ─── Servidor ─────────────────────────────────────────────
app.listen(PORT, () => {
  logger.info('Servidor iniciado', {
    port: PORT,
    webhook: 'POST /webhook/whatsapp',
    health:  'GET  /',
    cron:    '7:00am, 6:00pm, cada 15min (Colombia)',
  });
});
