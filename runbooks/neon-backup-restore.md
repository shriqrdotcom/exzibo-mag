# Neon Backup and Restore Verification Runbook

**Purpose:** Verify that Neon backups exist and can be restored if needed.

## Prerequisites

- Access to the Neon Console (https://console.neon.tech) with project owner role
- `psql` or equivalent PostgreSQL client installed

## Steps

### 1. Check Backup Schedule

Neon provides automatic daily backups stored for 7 days. Verify in the dashboard:

1. Go to Neon Console → Branches → select the main branch
2. Click "Backups" tab
3. Verify that daily backups exist for the expected retention period

### 2. Verify a Recent Backup

```sh
# Create a read-only replica of the latest backup for verification:
# (This is done through the Neon Console — "Create Branch from Backup")
# 1. Go to Branches → "Create Branch"
# 2. Source: "From backup"
# 3. Select the most recent backup
# 4. Name it "verify-$(date +%Y%m%d)"
# 5. Wait for the branch to be created

# Connect to the verification branch and run sanity checks:
psql "$DATABASE_URL_VERIFY" -c "SELECT count(*) FROM restaurants;"
psql "$DATABASE_URL_VERIFY" -c "SELECT count(*) FROM users;"
psql "$DATABASE_URL_VERIFY" -c "SELECT count(*) FROM realtime_outbox;"
```

### 3. Restore Procedure (if needed)

If primary data loss occurs:

1. Go to Neon Console → Branches → main branch
2. Click "Restore" → "From backup"
3. Select the desired backup point
4. Confirm — Neon will create a new branch restored to that point
5. Update `DATABASE_URL` in Vercel environment variables to point to the restored branch
6. Trigger a new Vercel deployment
7. Verify the app works with the restored data

### 4. Verification After Restore

```sh
# After updating DATABASE_URL and deploying:
curl -s https://www.exzibo.online/api/system?action=readiness | jq
# All checks should return "ok"
```

## ⚠️ Do Not

- Execute `DROP TABLE` or `DELETE` statements during verification
- Use production credentials in any scripts
- Keep verification branches longer than needed (delete after confirming)
