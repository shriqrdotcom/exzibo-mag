---
name: Production data boundary
description: The live exzibo.online deployment uses a separate Vercel/Neon environment from this Replit workspace.
---

# Production data boundary

The live `*.exzibo.online` application and its restaurant records are hosted through a separate Vercel deployment with its own Neon database. The Replit development database is not the live data source and must never be treated as a production mutation target.

**Why:** Production queries through the Replit database tool reported that this Repl has no production Neon database, while the live domain served Vercel responses and returned the existing restaurant records.

**How to apply:** For production data changes, use an authenticated application admin action in the deployed app or obtain the correct production database connection through the project’s deployment setup. Do not run UPDATEs against the Replit development database expecting live changes.