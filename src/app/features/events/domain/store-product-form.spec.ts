import {
  emptyStoreProductFormValue,
  formValueToStoreProductInput,
  makeCover,
  moveImage,
  removeImageAt,
  storeProductDeleteBlockReason,
  storeProductToFormValue,
  validateStoreProduct,
} from './store-product-form';
import { StoreProduct } from './store.model';

const product: StoreProduct = {
  id: 'p1',
  eventId: 'e1',
  name: 'Kit DevFest',
  description: 'Mochila y stickers',
  price: 80,
  isActive: true,
  position: 1,
  images: [
    { id: 'i1', url: 'https://x.test/1.png', position: 1, altText: 'Frente' },
    { id: 'i2', url: 'https://x.test/2.png', position: 2, altText: null },
  ],
};

const valid = { name: 'Polera', description: null, price: 60, isActive: true, images: [] };
const fields = (input: Parameters<typeof validateStoreProduct>[0], otherNames: string[] = []) =>
  validateStoreProduct(input, { otherNames }).errors.map((e) => e.field);

describe('store-product-form', () => {
  it('convierte el formulario aceptando coma decimal y recortando textos', () => {
    const input = formValueToStoreProductInput({
      name: '  Polera  ',
      description: '   ',
      price: ' 12,50 ',
      isActive: false,
      images: [{ url: 'https://x.test/a.png', altText: '  ' }],
    });
    expect(input).toEqual({
      name: 'Polera',
      description: null,
      price: 12.5,
      isActive: false,
      images: [{ url: 'https://x.test/a.png', altText: null }],
    });
    expect(Number.isNaN(formValueToStoreProductInput(emptyStoreProductFormValue()).price)).toBe(
      true,
    );
  });

  it('ida y vuelta desde un producto conserva la galería en orden', () => {
    const value = storeProductToFormValue(product);
    expect(value.price).toBe('80');
    expect(value.images).toEqual([
      { url: 'https://x.test/1.png', altText: 'Frente' },
      { url: 'https://x.test/2.png', altText: null },
    ]);
  });

  it('valida nombre obligatorio, largo y único sin distinguir mayúsculas', () => {
    expect(fields({ ...valid, name: ' ' })).toEqual(['name']);
    expect(fields({ ...valid, name: 'x'.repeat(101) })).toEqual(['name']);
    expect(fields(valid, ['POLERA'])).toEqual(['name']);
    expect(fields(valid, ['Kit'])).toEqual([]);
  });

  it('valida precio mayor que 0 con hasta 2 decimales', () => {
    expect(fields({ ...valid, price: 0 })).toEqual(['price']);
    expect(fields({ ...valid, price: -5 })).toEqual(['price']);
    expect(fields({ ...valid, price: NaN })).toEqual(['price']);
    expect(fields({ ...valid, price: 10.555 })).toEqual(['price']);
    expect(fields({ ...valid, price: 10.55 })).toEqual([]);
  });

  it('limita descripción y texto alternativo, y avisa si no hay imágenes', () => {
    expect(fields({ ...valid, description: 'x'.repeat(1001) })).toEqual(['description']);
    expect(
      fields({ ...valid, images: [{ url: 'https://x.test/a.png', altText: 'x'.repeat(201) }] }),
    ).toEqual(['images']);
    expect(validateStoreProduct(valid, { otherNames: [] }).warnings.map((w) => w.field)).toEqual([
      'images',
    ]);
  });

  it('mueve, define portada y quita imágenes sin mutar la lista', () => {
    const list = ['a', 'b', 'c'];
    expect(moveImage(list, 0, 1)).toEqual(['b', 'a', 'c']);
    expect(moveImage(list, 0, -1)).toEqual(list);
    expect(moveImage(list, 2, 1)).toEqual(list);
    expect(makeCover(list, 2)).toEqual(['c', 'a', 'b']);
    expect(makeCover(list, 0)).toEqual(list);
    expect(removeImageAt(list, 1)).toEqual(['a', 'c']);
    expect(list).toEqual(['a', 'b', 'c']);
  });

  it('cualquier compra, incluso anulada, bloquea el borrado', () => {
    expect(storeProductDeleteBlockReason(undefined)).toBeNull();
    expect(
      storeProductDeleteBlockReason({ pending: 0, paid: 0, cancelled: 0, paidUnits: 0 }),
    ).toBeNull();
    expect(
      storeProductDeleteBlockReason({ pending: 0, paid: 0, cancelled: 1, paidUnits: 0 }),
    ).toContain('1 compra');
    expect(
      storeProductDeleteBlockReason({ pending: 1, paid: 2, cancelled: 0, paidUnits: 3 }),
    ).toContain('3 compras');
  });
});
