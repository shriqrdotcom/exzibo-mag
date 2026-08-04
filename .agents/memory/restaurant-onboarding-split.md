---
name: Restaurant onboarding split
description: The cross-page state and persistence boundary for restaurant creation and subscription selection.
---

Restaurant onboarding uses a browser-persisted draft so the restaurant details page and subscription page remain independent routes without losing in-progress input. Restaurant creation still sends only profile data to the secure create endpoint; the selected plan and limits are applied afterward through the existing superadmin-only platform update path.

**Why:** Restaurant creation deliberately treats plan, status, and plan limits as server-controlled fields. Keeping the two-step UI separate must not weaken that authorization boundary or make a route change lose the user's draft.

**How to apply:** Reuse the shared draft helpers for future onboarding steps, clear the draft only after creation succeeds, and surface platform-update failures instead of treating a partially persisted entitlement as success.