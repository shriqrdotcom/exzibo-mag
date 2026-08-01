---
name: Browser security policy
description: Shared browser headers, staged document CSP, production HSTS, and safe external URL handling.
---

Document responses use a staged `Content-Security-Policy-Report-Only` policy because the React app still contains inline style tags; API responses keep the baseline headers without document-only CSP directives.

**Why:** A strict enforcing policy would currently create compatibility failures, while broad `unsafe-inline`, `unsafe-eval`, wildcard sources, or arbitrary third-party scripts are not acceptable security tradeoffs.

**How to apply:** Keep the CSP source list evidence-based when adding browser capabilities. HSTS must remain conditional on production HTTPS, and user-controlled external links must pass HTTP(S)-only normalization before reaching `href` or `window.open`.