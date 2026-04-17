/**
 * Polar product ID mapping — create these in Polar dashboard first
 * IDs are placeholders until real products are created
 */

export const PRODUCTS = {
  pro: { id: 'prod_pro_placeholder', price: 1500, name: 'Pro', interval: 'month' },
  business: { id: 'prod_biz_placeholder', price: 3900, name: 'Business', interval: 'month' },
};

/**
 * Derive plan name from Polar product ID
 * @param {string} productId
 * @returns {string} plan name
 */
export function planFromProductId(productId) {
  if (productId === PRODUCTS.pro.id) return 'pro';
  if (productId === PRODUCTS.business.id) return 'business';
  return 'free';
}
