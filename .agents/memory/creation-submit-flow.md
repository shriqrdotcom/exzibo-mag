---
name: Creation submit flow
description: The restaurant creation form must submit directly to the authenticated create endpoint.
---

The restaurant creation action should not be gated by advisory list or availability
preflight requests. The authenticated create endpoint is the source of truth for
slug validation and duplicate conflicts; the UI should show those responses clearly.

**Why:** Separate preflight requests can stall or fail independently, leaving an
apparently enabled primary button stuck in a loading state without reaching creation.

**How to apply:** Keep the primary action disabled only while its own mutation is
in progress. Avoid making it depend on background availability checks or list reads.