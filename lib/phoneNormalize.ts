/** Normaliza un telefono de agenda para guardarlo (minimo de digitos razonable). */
export function normalizeContactPhone(raw: string): string {
  if (!raw) return '';
  let s = raw.trim().replace(/[\s().-]/g, '');
  if (s.startsWith('00')) {
    s = `+${s.slice(2)}`;
  }
  return s;
}
