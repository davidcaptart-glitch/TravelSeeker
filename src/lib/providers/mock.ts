// Datos simulados deterministas para probar la app sin claves de API.
// El precio varía con la franja horaria para que las alertas "encuentren" ofertas de vez en cuando.

export function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967295;
}

export function timeBucket(hours = 6): number {
  return Math.floor(Date.now() / (hours * 3600_000));
}
