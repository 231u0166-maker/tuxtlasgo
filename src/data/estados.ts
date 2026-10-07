// Los tres municipios de la región siguen siendo el caso principal;
// cualquier otro lugar de México también puede registrarse.
export const MUNICIPIOS_TUXTLAS = ['Catemaco', 'San Andrés Tuxtla', 'Santiago Tuxtla'];

export const ESTADOS_MEXICO = [
  'Aguascalientes', 'Baja California', 'Baja California Sur', 'Campeche', 'Chiapas',
  'Chihuahua', 'Ciudad de México', 'Coahuila', 'Colima', 'Durango', 'Guanajuato',
  'Guerrero', 'Hidalgo', 'Jalisco', 'México', 'Michoacán', 'Morelos', 'Nayarit',
  'Nuevo León', 'Oaxaca', 'Puebla', 'Querétaro', 'Quintana Roo', 'San Luis Potosí',
  'Sinaloa', 'Sonora', 'Tabasco', 'Tamaulipas', 'Tlaxcala', 'Veracruz', 'Yucatán', 'Zacatecas',
];

// En la base el municipio es un solo texto: los de Los Tuxtlas tal cual
// ("Catemaco") y cualquier otro lugar como "Municipio, Estado".
export function componerMunicipio(estado: string, municipio: string): string {
  return estado === 'Veracruz' && MUNICIPIOS_TUXTLAS.includes(municipio)
    ? municipio
    : `${municipio}, ${estado}`;
}

export function separarMunicipio(valor: string): { estado: string; municipio: string } {
  if (MUNICIPIOS_TUXTLAS.includes(valor)) return { estado: 'Veracruz', municipio: valor };
  const i = valor.lastIndexOf(', ');
  if (i >= 0 && ESTADOS_MEXICO.includes(valor.slice(i + 2))) {
    return { estado: valor.slice(i + 2), municipio: valor.slice(0, i) };
  }
  // Texto suelto sin estado (no debería existir): se asume Veracruz.
  return { estado: 'Veracruz', municipio: valor };
}
