import {
  PRICE_DECIMALS,
  PRICE_SCALE,
  QUANTITY_DECIMALS,
  QUANTITY_SCALE,
} from '@crypto/protocol';

/** Fixed-point price helpers. Internal unit: cents (PRICE_SCALE = 100). */

export function priceToUnits(price: number): number {
  return Math.round(price * PRICE_SCALE);
}

export function unitsToPriceString(units: number): string {
  return (units / PRICE_SCALE).toFixed(PRICE_DECIMALS);
}

export function priceStringToUnits(price: string): number {
  const parsed = Number(price);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid price string: ${price}`);
  }
  return priceToUnits(parsed);
}

export function quantityToUnits(quantity: number): number {
  return Math.round(quantity * QUANTITY_SCALE);
}

export function unitsToQuantityString(units: number): string {
  return (units / QUANTITY_SCALE).toFixed(QUANTITY_DECIMALS);
}

export function quantityStringToUnits(quantity: string): number {
  const parsed = Number(quantity);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid quantity string: ${quantity}`);
  }
  return quantityToUnits(parsed);
}

export function addQuantityUnits(a: number, b: number): number {
  return a + b;
}

export function maxInt(a: number, b: number): number {
  return a > b ? a : b;
}

export function minInt(a: number, b: number): number {
  return a < b ? a : b;
}
