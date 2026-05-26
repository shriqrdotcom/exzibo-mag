const MENU_HOST = 'menu.exzibo.online'

/**
 * Builds the canonical customer-facing URL for a restaurant page.
 * Always targets menu.exzibo.online.
 *
 * @param {string} slug         - Restaurant slug (e.g. "thetaj")
 * @param {string} [page]       - Nav page: "home" | "menu" | "booking" | "orders" | "cart"
 * @param {string} [tableNumber]- Optional table number (e.g. "5")
 */
export function getMenuUrl(slug, page = 'home', tableNumber = null) {
  if (!slug) return `https://${MENU_HOST}`
  if (tableNumber) {
    return `https://${MENU_HOST}/${slug}/${tableNumber}/${page}`
  }
  return `https://${MENU_HOST}/${slug}/${page}`
}

/**
 * Opens the customer menu page in a new tab.
 */
export function openMenuInTab(slug, page = 'home', tableNumber = null) {
  window.open(getMenuUrl(slug, page, tableNumber), '_blank', 'noopener,noreferrer')
}
