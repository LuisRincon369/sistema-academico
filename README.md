# Sistema Académico IUE — Backend

Backend Node.js que automatiza alertas académicas usando Notion y WhatsApp.

## Estructura

```
sistema-academico/
  index.js              ← servidor Express + cron jobs
  db.js                 ← conexión PostgreSQL
  .env                  ← variables de entorno (no subir a git)
  setup-db.sql          ← script para crear tablas en Render
  routes/
    webhook.js          ← recibe comandos de WhatsApp (Twilio)
  services/
    notion.js           ← lee y actualiza Notion API
    twilio.js           ← envía mensajes WhatsApp
    cron.js             ← monitorea fechas y dispara alertas
```

## Setup

### 1. Instalar dependencias
```bash
npm install
```

### 2. Configurar variables de entorno
Copia `.env.example` como `.env` y rellena:
```env
TWILIO_ACCOUNT_SID=ACxxxxxxxxx
TWILIO_AUTH_TOKEN=xxxxxxxxx
TWILIO_WHATSAPP_FROM=whatsapp:+14155238886
DATABASE_URL=postgresql://...
PORT=3000
```

### 3. Crear tabla en PostgreSQL (Render)
Ejecuta el contenido de `setup-db.sql` en el PSQL Command de Render.

### 4. Registrar primer usuario
```sql
INSERT INTO usuarios (nombre, telefono, notion_token, notion_db_id)
VALUES ('Luis', '+573XXXXXXXXX', 'secret_XXX', 'db-id-XXX');
```

### 5. Correr localmente
```bash
node index.js
```

### 6. Desplegar en Render
- New Web Service → conecta tu repo GitHub
- Build command: `npm install`
- Start command: `node index.js`
- Agrega las variables de entorno del `.env`

### 7. Configurar webhook en Twilio
En Twilio Console → WhatsApp Sandbox Settings:
```
When a message comes in: https://TU-APP.onrender.com/webhook/whatsapp
Method: HTTP POST
```

## Comandos WhatsApp disponibles

| Comando | Acción |
|---------|--------|
| `semana` | Lista actividades de los próximos 7 días |
| `listo N` | Marca actividad N como completada en Notion |
| `posponer N` | Recuerda actividad N en 2 horas |
| `info N` | Muestra temas de la actividad N |
| `ayuda` | Muestra todos los comandos |

## Cron jobs

- **7:00am Colombia** — alerta matutina
- **6:00pm Colombia** — alerta de tarde
