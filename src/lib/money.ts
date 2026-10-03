import Decimal from 'decimal.js';
Decimal.set({ precision: 32, rounding: Decimal.ROUND_HALF_UP });
export function lineTotal(
  q: string | number,
  price: string | number,
  discount: string | number = 0,
  tax: string | number = 0,
) {
  const net = new Decimal(q).mul(price).minus(discount);
  if (net.isNegative()) throw new Error('El descuento supera el importe.');
  return net.mul(new Decimal(tax).div(100).plus(1)).toDecimalPlaces(2).toFixed(2);
}
export function formatMoney(value: string | number, symbol = 'C$') {
  return `${symbol} ${new Intl.NumberFormat('es-NI', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value))}`;
}
