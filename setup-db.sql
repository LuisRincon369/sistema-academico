-- ─────────────────────────────────────────────────────────
-- Setup inicial de la base de datos PostgreSQL
-- Ejecutar en Render → tu DB → PSQL Command
-- ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS usuarios (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre       VARCHAR(100)  NOT NULL,
  telefono     VARCHAR(20)   UNIQUE NOT NULL,
  notion_token TEXT          NOT NULL,
  notion_db_id VARCHAR(100)  NOT NULL,
  activo       BOOLEAN       DEFAULT true,
  creado_en    TIMESTAMP     DEFAULT NOW()
);

-- Ejemplo: insertar primer usuario (reemplaza los valores)
-- INSERT INTO usuarios (nombre, telefono, notion_token, notion_db_id)
-- VALUES (
--   'Luis',
--   '+573XXXXXXXXX',
--   'secret_XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
--   'XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX'
-- );

-- Ver todos los usuarios
-- SELECT id, nombre, telefono, activo, creado_en FROM usuarios;

-- ─────────────────────────────────────────────────────────
-- Tabla de recordatorios persistentes (reemplaza setTimeout en memoria)
-- R1: Los timers de "posponer" sobreviven reinicios del servidor
-- ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS recordatorios (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  telefono     VARCHAR(20)  NOT NULL,
  actividad_id VARCHAR(100) NOT NULL,
  nombre       TEXT         NOT NULL,
  enviar_en    TIMESTAMP    NOT NULL,
  enviado      BOOLEAN      DEFAULT false,
  creado_en    TIMESTAMP    DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_recordatorios_pendientes
  ON recordatorios (enviar_en)
  WHERE enviado = false;
