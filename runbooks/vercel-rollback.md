# Vercel Rollback Runbook

**Purpose:** Roll back a bad deployment to the last known-good version.

## Prerequisites

- Access to the Vercel dashboard or Vercel CLI authenticated with the project scope
- Know the commit SHA or deployment ID of the last good deploy

## Steps

### 1. Identify the bad deployment

```sh
# List recent deployments
vercel list --scope shriqrdotcom

# Or via Vercel dashboard: https://vercel.com/shriqrdotcom/exzibo-mag/deployments
```

### 2. Roll back via CLI

```sh
# Roll back to a specific deployment by URL or ID
vercel rollback <deployment-url-or-id> --scope shriqrdotcom
```

### 3. Roll back via Dashboard

1. Navigate to the project's Deployments tab
2. Find the last known-good deployment (green checkmark)
3. Click the "..." menu → "Promote to Production"
4. Confirm in the dialog

### 4. Verify

```sh
# Check that the production URL serves the expected version
curl -s https://www.exzibo.online/api/system?action=liveness | jq
# Expected: { "status": "ok", "version": "...", "timestamp": "..." }
```

## Post-rollback

- Mark the bad deployment commit in your changelog
- If the rollback was caused by a code change, create a revert PR with the fix
- If the rollback was caused by a configuration change, review the config diff before re-applying

## ⚠️ Do Not

- Run database migrations after rollback — the previous version may not be compatible
- Change environment variables without a review
- Deploy again until the root cause is identified
