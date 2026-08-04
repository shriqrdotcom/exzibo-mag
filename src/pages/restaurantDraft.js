export const DRAFT_KEY = 'exzibo:create-restaurant-draft'

export const emptyPlanLimits = {
  STARTER: { totalTables: 0, ownerPanelUsers: 0, managerPanelUsers: 0, employeeSectionUsers: 0 },
  GROWTH: { totalTables: 0, ownerPanelUsers: 0, managerPanelUsers: 0, employeeSectionUsers: 0 },
  SCALE: { totalTables: 0, ownerPanelUsers: 0, managerPanelUsers: 0, employeeSectionUsers: 0 },
  CUSTOMISED: { totalTables: 0, ownerPanelUsers: 0, managerPanelUsers: 0, employeeSectionUsers: 0 },
}

export function readRestaurantDraft(fallback) {
  try {
    const saved = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null')
    return saved ? { ...fallback, ...saved, socialLinks: { ...fallback.socialLinks, ...saved.socialLinks }, planLimits: { ...fallback.planLimits, ...saved.planLimits } } : fallback
  } catch {
    return fallback
  }
}

export function persistRestaurantDraft(form) {
  try {
    const { logo, uploadedImages, tableInput, ...safe } = form
    localStorage.setItem(DRAFT_KEY, JSON.stringify({
      ...safe,
      logo: logo ? { url: logo.url } : null,
      uploadedImages: (uploadedImages || []).map(image => ({ url: image.url })),
    }))
  } catch {
    // Draft persistence is helpful, but must never block the creation flow.
  }
}

export function clearRestaurantDraft() {
  try { localStorage.removeItem(DRAFT_KEY) } catch { /* storage may be unavailable */ }
}