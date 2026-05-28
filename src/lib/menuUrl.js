const MENU_HOST = 'menu.exzibo.online'

/**
 * Builds the canonical customer-facing URL for a restaurant page.
 * Always targets menu.exzibo.online.
 *
 * URL format: https://menu.exzibo.online/{slug}/home/{tableNumber}
 *
 * @param {string} slug         - Restaurant slug (e.g. "the-taj")
 * @param {string} [page]       - Nav page: "home" | "menu" | "booking" | "orders" | "cart"
 * @param {string|number} [tableNumber] - Table number (e.g. 5). Defaults to 1 when omitted.
 */
export function getMenuUrl(slug, page = 'home', tableNumber = null) {
  if (!slug) return `https://${MENU_HOST}`
  const table = tableNumber != null ? tableNumber : 1
  return `https://${MENU_HOST}/${slug}/${page}/${table}`
}

/**
 * Builds a table-specific URL: https://menu.exzibo.online/{slug}/home/{tableNumber}
 */
export function getTableMenuUrl(slug, tableNumber) {
  return `https://${MENU_HOST}/${slug}/home/${tableNumber}`
}

/**
 * Opens the customer menu page in a new tab.
 */
export function openMenuInTab(slug, page = 'home', tableNumber = null) {
  window.open(getMenuUrl(slug, page, tableNumber), '_blank', 'noopener,noreferrer')
}
