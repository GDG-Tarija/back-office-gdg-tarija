import { ValidationResult } from './event-validators';
import {
  StoreProduct,
  StoreProductImageInput,
  StoreProductInput,
  StoreProductOrderCounts,
} from './store.model';

export const STORE_PRODUCT_NAME_MAX = 100;
export const STORE_PRODUCT_DESCRIPTION_MAX = 1000;
export const STORE_IMAGE_ALT_MAX = 200;

/** Valor del formulario: el precio como texto para el input nativo ("12,50" se acepta). */
export interface StoreProductFormValue {
  name: string;
  description: string;
  price: string;
  isActive: boolean;
  images: StoreProductImageInput[];
}

export function emptyStoreProductFormValue(): StoreProductFormValue {
  return { name: '', description: '', price: '', isActive: true, images: [] };
}

export function storeProductToFormValue(p: StoreProduct): StoreProductFormValue {
  return {
    name: p.name,
    description: p.description ?? '',
    price: String(p.price),
    isActive: p.isActive,
    images: p.images.map((i) => ({ url: i.url, altText: i.altText })),
  };
}

/** Texto no numérico produce NaN para que el validador lo rechace. */
export function formValueToStoreProductInput(v: StoreProductFormValue): StoreProductInput {
  const priceText = v.price.trim().replace(',', '.');
  return {
    name: v.name.trim(),
    description: v.description.trim() || null,
    price: priceText === '' ? NaN : Number(priceText),
    isActive: v.isActive,
    images: v.images.map((i) => ({ url: i.url, altText: i.altText?.trim() || null })),
  };
}

function hasAtMostTwoDecimals(n: number): boolean {
  return Math.abs(n * 100 - Math.round(n * 100)) < 1e-6;
}

export interface StoreProductValidationContext {
  /** Nombres de los demás productos del evento (sin el que se edita). */
  otherNames: string[];
}

/** Espejo de las reglas de la BD (save_store_product y CHECK) con mensajes por campo. */
export function validateStoreProduct(
  input: StoreProductInput,
  ctx: StoreProductValidationContext,
): ValidationResult {
  const r: ValidationResult = { errors: [], warnings: [] };
  const name = input.name.trim();
  if (!name) {
    r.errors.push({ field: 'name', message: 'El nombre del producto es obligatorio.' });
  } else if (name.length > STORE_PRODUCT_NAME_MAX) {
    r.errors.push({
      field: 'name',
      message: `El nombre no puede superar los ${STORE_PRODUCT_NAME_MAX} caracteres.`,
    });
  } else if (ctx.otherNames.some((n) => n.trim().toLowerCase() === name.toLowerCase())) {
    r.errors.push({ field: 'name', message: 'Ya existe un producto con ese nombre en la tienda.' });
  }

  if ((input.description?.length ?? 0) > STORE_PRODUCT_DESCRIPTION_MAX) {
    r.errors.push({
      field: 'description',
      message: `La descripción no puede superar los ${STORE_PRODUCT_DESCRIPTION_MAX} caracteres.`,
    });
  }

  if (typeof input.price !== 'number' || isNaN(input.price) || input.price <= 0) {
    r.errors.push({ field: 'price', message: 'El precio debe ser un número mayor que 0.' });
  } else if (!hasAtMostTwoDecimals(input.price)) {
    r.errors.push({ field: 'price', message: 'El precio admite como máximo 2 decimales.' });
  }

  if (input.images.some((i) => (i.altText?.length ?? 0) > STORE_IMAGE_ALT_MAX)) {
    r.errors.push({
      field: 'images',
      message: `La descripción de cada imagen admite hasta ${STORE_IMAGE_ALT_MAX} caracteres.`,
    });
  }
  if (input.images.length === 0) {
    r.warnings.push({
      field: 'images',
      message: 'Sin imágenes el producto se verá con un ícono genérico en la tienda.',
    });
  }
  return r;
}

// ---------------------------------------------------------------------------
// Galería: la primera imagen es la portada
// ---------------------------------------------------------------------------

export function moveImage<T>(images: readonly T[], index: number, direction: -1 | 1): T[] {
  const target = index + direction;
  if (index < 0 || index >= images.length || target < 0 || target >= images.length) {
    return [...images];
  }
  const next = [...images];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

export function makeCover<T>(images: readonly T[], index: number): T[] {
  if (index <= 0 || index >= images.length) return [...images];
  const next = [...images];
  const [cover] = next.splice(index, 1);
  return [cover, ...next];
}

export function removeImageAt<T>(images: readonly T[], index: number): T[] {
  return images.filter((_, i) => i !== index);
}

// ---------------------------------------------------------------------------
// Borrado y estado
// ---------------------------------------------------------------------------

export function totalOrders(counts: StoreProductOrderCounts | undefined): number {
  return counts ? counts.pending + counts.paid + counts.cancelled : 0;
}

/** Cualquier compra, incluso anulada, impide borrar (la BD también lo impide): se desactiva. */
export function storeProductDeleteBlockReason(
  counts: StoreProductOrderCounts | undefined,
): string | null {
  const total = totalOrders(counts);
  if (total === 0) return null;
  return `Tiene ${total} ${total === 1 ? 'compra' : 'compras'} (incluidas las anuladas): desactívalo en lugar de eliminarlo.`;
}
