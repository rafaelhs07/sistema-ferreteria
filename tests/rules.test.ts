import { describe, it, expect } from 'vitest';
import { lineTotal } from '../src/lib/money';
import { documentSchema, quantity, productSchema } from '../src/lib/validation';
describe('Dinero decimal y límites de entrada', () => {
  it('redondea por línea y evita el error de coma flotante', () => {
    expect(lineTotal('1.25', '10')).toBe('12.50');
    expect(lineTotal('3', '0.1')).toBe('0.30');
    expect(lineTotal('1', '1.005')).toBe('1.01');
  });
  it('rechaza descuentos negativos al neto', () => {
    expect(() => lineTotal(1, 10, 11)).toThrow();
  });
  it('rechaza cantidades vacías, negativas y fuera de precisión', () => {
    for (const n of ['', 0, -1, Infinity, 0.0000001])
      expect(quantity.safeParse(n).success).toBe(false);
  });
  it('no acepta documentos sin detalles ni productos sin nombre', () => {
    expect(documentSchema.safeParse({ kind: 'sale', lines: [] }).success).toBe(false);
    expect(productSchema.safeParse({ code: 'A', name: '', price: 10 }).success).toBe(false);
  });
});
