require('dotenv').config();
const twilio = require('twilio');

const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

async function enviarWhatsApp(telefono, mensaje) {
  const numero = telefono.startsWith('whatsapp:') ? telefono : `whatsapp:${telefono}`;
  const msg = await client.messages.create({
    from: process.env.TWILIO_WHATSAPP_FROM,
    to: numero,
    body: mensaje
  });
  console.log(`  ✉️  Enviado a ${telefono} — SID: ${msg.sid}`);
  return msg;
}

module.exports = { enviarWhatsApp };
