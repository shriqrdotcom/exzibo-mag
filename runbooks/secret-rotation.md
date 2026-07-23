# Secret Rotation Runbook

**Purpose:** Rotate compromised or expiring secrets with minimal downtime.

## Secrets to Rotate

| Secret | Location | Rotation Frequency |
|--------|----------|-------------------|
| `DATABASE_URL` | Vercel + Replit | On compromise |
| `BETTER_AUTH_SECRET` | Vercel + Replit | On compromise |
| `SESSION_SECRET` | Replit | On compromise |
| `REALTIME_PUBLISH_SECRET` | Vercel (Worker) + Replit | On compromise |
| `SUPERADMIN_ALLOWED_EMAILS` | Vercel + Replit | As needed |

## Steps

### 1. Generate New Values

```sh
# Generate a cryptographically random 64-char hex secret
openssl rand -hex 32

# Generate a base64-encoded 256-bit key (for Better Auth)
openssl rand -base64 32
```

### 2. Update in Vercel

1. Go to Vercel Dashboard → Project Settings → Environment Variables
2. Locate the secret to rotate
3. Click "Edit" → paste the new value → Save
4. Choose which environments to apply to (Production, Preview, Development)
5. Trigger a re-deployment:
   ```sh
   vercel deploy --prod
   ```

### 3. Update in Replit

1. Go to Replit Workspace → Tools → Secrets
2. Locate the secret to rotate
3. Click "Edit" → paste the new value → Save
4. Restart the development workflow

### 4. Verify After Rotation

```sh
# Check the readiness endpoint to confirm the application starts correctly
curl -s https://www.exzibo.online/api/system?action=readiness | jq

# For Better Auth secret rotation, verify authentication works:
# — Log in through the admin dashboard
# — Confirm session persists across page reloads
```

## ⚠️ Do Not

- Rotate `DATABASE_URL` without verifying the new connection string points to the same data
- Rotate multiple secrets simultaneously — change one at a time and verify
- Commit secrets to the repository
- Share new secrets through unencrypted channels
