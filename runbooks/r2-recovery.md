# R2 Object Inventory and Recovery Runbook

**Purpose:** Inventory R2 bucket objects and recover them in the event of data loss.

## Prerequisites

- Cloudflare dashboard access with R2 permissions
- `wrangler` CLI authenticated with the Cloudflare account
- R2 bucket name (e.g., `exzibo-media`)

## Steps

### 1. List Objects in the Bucket

```sh
# List all objects (may require pagination for large buckets)
npx wrangler r2 object list <bucket-name>

# List with a prefix filter (e.g., restaurant uploads)
npx wrangler r2 object list <bucket-name> --prefix restaurants/
```

### 2. Inventory to Local File

```sh
# Export the object listing to a JSON file for analysis
npx wrangler r2 object list <bucket-name> --json > r2-inventory-$(date +%Y%m%d).json

# Count objects and total size
cat r2-inventory-$(date +%Y%m%d).json | jq '[.objects[] | {key: .key, size: .size}] | length'
cat r2-inventory-$(date +%Y%m%d).json | jq '[.objects[] | .size] | add'
```

### 3. Check Object Accessibility

```sh
# Verify that a representative sample of objects is retrievable
# Pick 5-10 objects of varying sizes and types
npx wrangler r2 object get <bucket-name> <object-key> --file /dev/null 2>&1
```

### 4. Recovery Procedure

If the bucket contents are accidentally deleted or corrupted:

1. **Check for versioning**: If the bucket has versioning enabled, objects can be restored:
   ```sh
   npx wrangler r2 object list <bucket-name> --all-versions
   ```

2. **Re-upload from local backups**: If local copies exist:
   ```sh
   npx wrangler r2 object put <bucket-name> <object-key> --file <local-file-path>
   ```

3. **Regenerate from original sources**: Many uploads (menu images, logos) can be re-uploaded through the admin dashboard by a superadmin

## ⚠️ Do Not

- Delete objects from R2 during verification
- Expose public bucket URLs without authentication
- Store R2 bucket names or credentials in scripts committed to the repo
