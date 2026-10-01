/*
 * Ticket product shown on the checkout page (/zahlung): name, description, image and VAT rate.
 * The price comes from the system (amount requested for the registration) and is a NET price;
 * the configured VAT is added on top at checkout (net + VAT = amount charged).
 */
export interface Product {
  name: string;
  description: string;
  /** Uploaded image (mail-images store) or https image URL. */
  imageId: string;
  imageUrl: string;
  /** VAT in percent added on top of the net price (0 = none, e.g. Kleinunternehmer). */
  vatRate: number;
}

export const VAT_RATES = [0, 7, 19] as const;

export const DEFAULT_PRODUCT: Product = { name: "Ticket", description: "Eintritt zum Event inkl. QR-Ticket per E-Mail.", imageId: "", imageUrl: "", vatRate: 0 };

export function normalizeProduct(input: unknown): Product {
  const p = (input && typeof input === "object" ? input : {}) as Partial<Product>;
  const str = (v: unknown, max: number, fallback: string) => (typeof v === "string" ? v.slice(0, max) : fallback);
  return {
    name: str(p.name, 120, DEFAULT_PRODUCT.name).trim() || DEFAULT_PRODUCT.name,
    description: str(p.description, 1000, DEFAULT_PRODUCT.description),
    imageId: typeof p.imageId === "string" && /^[0-9a-f-]{36}$/.test(p.imageId) ? p.imageId : "",
    imageUrl: typeof p.imageUrl === "string" && /^https:\/\/[^\s"'<>]+$/.test(p.imageUrl.trim()) ? p.imageUrl.trim().slice(0, 500) : "",
    vatRate: (VAT_RATES as readonly number[]).includes(p.vatRate as number) ? (p.vatRate as number) : 0,
  };
}

/** Net price (cents) + VAT on top = gross amount that is charged. */
export function priceBreakdown(netCents: number, vatRate: number) {
  const vat = Math.round((netCents * vatRate) / 100);
  return { net: netCents, vat, gross: netCents + vat };
}
