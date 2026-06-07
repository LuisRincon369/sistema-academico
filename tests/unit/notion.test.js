// Tests de services/notion.js — solo formatearActividades (función pura, sin I/O)
const { formatearActividades } = require('../../services/notion');

// fecha en formato YYYY-MM-DD usando hora local para evitar problemas de zona horaria
function fechaLocal(diasOffset) {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + diasOffset);
  const y   = d.getFullYear();
  const m   = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dia}`;
}

function crearActividad({ nombre, fecha, porcentaje, tipo }) {
  return {
    id: 'page-id-123',
    properties: {
      Nombre:     { title:  [{ plain_text: nombre }] },
      Fecha:      { date:   { start: fecha } },
      Porcentaje: { number: porcentaje },
      Tipo:       { select: { name: tipo } },
      Estado:     { select: { name: 'Pendiente' } },
    },
  };
}

describe('formatearActividades', () => {
  test('retorna null para lista vacía', () => {
    expect(formatearActividades([])).toBeNull();
  });

  test('incluye el nombre de la actividad en el mensaje', () => {
    const actividades = [crearActividad({ nombre: 'Parcial de Cálculo', fecha: fechaLocal(0), porcentaje: 0.3, tipo: 'Parcial' })];
    expect(formatearActividades(actividades)).toContain('Parcial de Cálculo');
  });

  test('muestra el porcentaje formateado como %', () => {
    const actividades = [crearActividad({ nombre: 'Taller', fecha: fechaLocal(4), porcentaje: 0.15, tipo: 'Taller' })];
    expect(formatearActividades(actividades)).toContain('15%');
  });

  // La lógica usa Math.ceil((noon_fecha - midnight_hoy) / 86400000)
  // fechaLocal(0) → dias=1 (0.5d → ceil=1) → 🔴
  test('usa emoji rojo para actividades que vencen hoy (dias <= 1)', () => {
    const actividades = [crearActividad({ nombre: 'Quiz urgente', fecha: fechaLocal(0), porcentaje: 0.1, tipo: 'Quiz' })];
    expect(formatearActividades(actividades)).toContain('🔴');
  });

  // fechaLocal(1) → dias=2 (1.5d → ceil=2) → 🟡
  test('usa emoji amarillo para actividades en 2-3 días (dias <= 3)', () => {
    const actividades = [crearActividad({ nombre: 'Entrega', fecha: fechaLocal(1), porcentaje: 0.2, tipo: 'Proyecto' })];
    expect(formatearActividades(actividades)).toContain('🟡');
  });

  // fechaLocal(4) → dias=5 (4.5d → ceil=5) → 🟢
  test('usa emoji verde para actividades en más de 3 días (dias > 3)', () => {
    const actividades = [crearActividad({ nombre: 'Proyecto final', fecha: fechaLocal(4), porcentaje: 0.4, tipo: 'Proyecto' })];
    expect(formatearActividades(actividades)).toContain('🟢');
  });

  test('incluye instrucciones de respuesta al final', () => {
    const actividades = [crearActividad({ nombre: 'Test', fecha: fechaLocal(4), porcentaje: 0.1, tipo: 'Quiz' })];
    expect(formatearActividades(actividades)).toContain('listo N');
  });

  test('numera correctamente varias actividades', () => {
    const actividades = [
      crearActividad({ nombre: 'Primera',  fecha: fechaLocal(4), porcentaje: 0.1, tipo: 'Quiz' }),
      crearActividad({ nombre: 'Segunda',  fecha: fechaLocal(5), porcentaje: 0.2, tipo: 'Taller' }),
    ];
    const resultado = formatearActividades(actividades);
    expect(resultado).toContain('1. Primera');
    expect(resultado).toContain('2. Segunda');
  });
});
