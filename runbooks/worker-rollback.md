# Cloudflare Worker Rollback Runbook

**Purpose:** Roll back a realtime Worker deployment to a previous version.

## Prerequisites

- Cloudflare dashboard access with Workers & Pages scope
- `wrangler` CLI authenticated with the project's Cloudflare account

## Steps

### 1. Check the Worker name

The realtime Worker is deployed under a project-specific name (e.g. `exzibo-realtime`). Confirm which name to target:

```sh
wrangler deploy --dry-run 2>/dev/null | grep -i "Worker name" || echo "Check wrangler.jsonc"
```

### 2. List available versions

```sh
# Via wrangler
npx wrangler versions list --name exzibo-realtime

# Note: this returns a list of version IDs with their deployment timestamps
```

### 3. Roll back via Dashboard

1. Go to the Cloudflare Dashboard → Workers & Pages → exzibo-realtime
2. Click "Deployments" in the left nav
3. Find the last known-good deployment
4. Click the "..." menu → "Roll back to this version"
5. Confirm in the dialog

### 4. Verify

```sh
# Check the Worker responds correctly
curl -s https://realtime.exzibo.online/health | jq
# Expected: a 200 response with status information
```

## Notes

- Worker rollbacks are instant — there is no build step
- Durable Objects retain their stored state across rollbacks
- After rollback, the outbox processor will automatically resume publishing to the previous Worker version

## ⚠️ Do Not

- Delete the existing Worker — always roll back to a previous version
- Change environment variables in the Worker before rolling back
- Deploy new code until the root cause is resolved
