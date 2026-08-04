---
name: Outbox release verification
description: Durable outbox release evidence must separate source-level SQL safety from scanner output and deployment topology.
---

The outbox claim and retry paths use prepared PostgreSQL statements with runtime
values passed separately. The current SAST scanner may still flag those calls as
SQL injection because it reports the database call site rather than actual
string interpolation.

**Why:** A clean source review and a clean scanner result are different release
claims. Treating a prepared-query false positive as resolved hides the remaining
security-gate work; treating it as an exploit overstates risk.

**How to apply:** Report both facts in audits: source-level SQL injection was not
established, while the scanner finding remains open until the scanner or an
approved review resolves the false positive. Separately verify the durable
external consumer; application preview health does not prove production delivery.