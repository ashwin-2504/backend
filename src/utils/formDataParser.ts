import { logger } from './logger.js';

/**
 * Parses FormData product fields from string representations to proper types.
 * FormData always sends values as strings — this normalizes them.
 *
 * Used by both addProduct and updateProduct controllers to eliminate duplication.
 */
export function parseProductFormData(body: Record<string, any>): Record<string, any> {
  const data = { ...body };

  // Numeric fields
  const floatFields = ['price', 'deliveryRadius', 'discountPercentage'] as const;
  const intFields = ['stockQty', 'minQty', 'maxQty'] as const;

  for (const field of floatFields) {
    if (data[field]) data[field] = parseFloat(data[field]);
  }

  for (const field of intFields) {
    if (data[field]) data[field] = parseInt(data[field], 10);
  }

  // Boolean fields
  const boolFields = ['isOrganic', 'isChemicalFree'] as const;
  for (const field of boolFields) {
    if (typeof data[field] === 'string') {
      data[field] = data[field] === 'true';
    }
  }

  // JSON-encoded fields
  const jsonFields = ['bulkPricing', 'imageUrls'] as const;
  for (const field of jsonFields) {
    if (typeof data[field] === 'string') {
      try {
        data[field] = JSON.parse(data[field]);
      } catch (e) {
        logger.warn(`Failed to parse ${field} in FormData`, e);
        if (field === 'imageUrls') data[field] = [];
      }
    }
  }

  return data;
}
