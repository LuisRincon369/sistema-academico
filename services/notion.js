const { Client } = require('@notionhq/client');

function getCliente(token) {
  return new Client({ auth: token });
}

async function getActividadesProximas(token, dbId, dias = 7) {
  const notion = getCliente(token);
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const limite = new Date(hoy.getTime() + dias * 24 * 60 * 60 * 1000);

  const res = await notion.databases.query({
    database_id: dbId,
    filter: {
      and: [
        { property: 'Fecha', date: { on_or_after: hoy.toISOString().split('T')[0] } },
        { property: 'Fecha', date: { on_or_before: limite.toISOString().split('T')[0] } },
        { property: 'Estado', select: { does_not_equal: 'Completada' } },
      ],
    },
    sorts: [{ property: 'Fecha', direction: 'ascending' }],
  });

  return res.results;
}

// ─── Cache por usuario (R9) ───────────────────────────────
// Evita que el índice N cambie entre "semana" y "listo N" / "posponer N" / "info N"
const _cache = new Map(); // telefono → { actividades, expira }
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutos

async function getActividadesCacheadas(token, dbId, telefono, dias = 7) {
  const ahora  = Date.now();
  const cached = _cache.get(telefono);
  if (cached && ahora < cached.expira) return cached.actividades;

  const actividades = await getActividadesProximas(token, dbId, dias);
  _cache.set(telefono, { actividades, expira: ahora + CACHE_TTL_MS });
  return actividades;
}

function invalidarCache(telefono) {
  _cache.delete(telefono);
}

async function getActividadPorIndice(token, dbId, telefono, indice) {
  const actividades = await getActividadesCacheadas(token, dbId, telefono);
  return actividades[indice] || null;
}

async function marcarCompletada(token, pageId) {
  const notion = getCliente(token);
  await notion.pages.update({
    page_id: pageId,
    properties: { Estado: { select: { name: 'Completada' } } },
  });
}

async function marcarPospuesta(token, pageId) {
  const notion = getCliente(token);
  await notion.pages.update({
    page_id: pageId,
    properties: { Estado: { select: { name: 'Pospuesta' } } },
  });
}

async function getDetalleActividad(token, pageId) {
  const notion = getCliente(token);
  const page   = await notion.pages.retrieve({ page_id: pageId });
  const props  = page.properties;
  return {
    temas:     props?.Temas?.rich_text?.[0]?.plain_text || null,
    materia:   props?.Materia?.select?.name || null,
    semana:    props?.Semana?.number || null,
    categoria: props?.Categoria?.select?.name || null,
  };
}

function formatearActividades(actividades) {
  if (!actividades.length) return null;

  const lineas = actividades.map((a, i) => {
    const props    = a.properties;
    const nombre   = props.Nombre?.title?.[0]?.plain_text || 'Sin nombre';
    const fecha    = props.Fecha?.date?.start;
    const pct      = props.Porcentaje?.number != null
      ? Math.round(props.Porcentaje.number * 100) + '%'
      : '?%';
    const tipo     = props.Tipo?.select?.name || '';
    const materia  = props.Materia?.select?.name || '';
    const semana   = props.Semana?.number ? `S${props.Semana.number}` : '';
    const fechaObj = fecha ? new Date(fecha + 'T12:00:00') : null;
    const hoy      = new Date(); hoy.setHours(0, 0, 0, 0);
    const dias     = fechaObj ? Math.ceil((fechaObj - hoy) / 86400000) : null;
    const emoji    = dias === null ? '⚪' : dias <= 1 ? '🔴' : dias <= 3 ? '🟡' : '🟢';
    const diasStr  = dias === null ? '' : dias === 0 ? 'HOY' : dias === 1 ? 'mañana' : `${dias}d`;
    const fechaStr = fechaObj
      ? fechaObj.toLocaleDateString('es-CO', { day: '2-digit', month: 'short' })
      : 'sin fecha';

    const linea2 = [materia, tipo, pct, `${fechaStr} (${diasStr})`, semana]
      .filter(Boolean)
      .join('  |  ');

    return `${emoji} *${i + 1}. ${nombre}*\n   ${linea2}`;
  });

  return `📋 *Actividades próximas:*\n\n${lineas.join('\n\n')}\n\n_Responde: *listo N* · *info N* · *posponer N* · *semana*_`;
}

module.exports = {
  getActividadesProximas,
  getActividadesCacheadas,
  getActividadPorIndice,
  invalidarCache,
  marcarCompletada,
  marcarPospuesta,
  getDetalleActividad,
  formatearActividades,
};
