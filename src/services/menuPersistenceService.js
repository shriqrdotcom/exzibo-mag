// Transactional menu persistence.
//
// Menu mutations and their realtime notifications commit together. The public
// menu service remains responsible for authorization, rate limits, and response
// contracts; this module owns database state transitions only.

import crypto from 'node:crypto'
import { getPool, getTxPool } from '../db/pg-sql.js'
import { buildCanonicalEnvelope } from './eventEnvelope.js'

function json(value, fallback = []) {
  return JSON.stringify(value == null ? fallback : value)
}

function itemValues(item, existing = {}) {
  const merged = { ...existing, ...item }
  return [
    merged.category_id ?? merged.categoryId ?? null,
    String(merged.name ?? '').trim(),
    merged.description ?? null,
    merged.price ?? 0,
    merged.image ?? null,
    merged.image_key ?? merged.imageKey ?? null,
    merged.available ?? true,
    merged.veg ?? true,
    json(merged.tags),
    json(merged.add_ons ?? merged.addOns),
    json(merged.variants),
    merged.is_published ?? merged.isPublished ?? false,
    merged.image_shape ?? merged.imageShape ?? 'vertical',
    Number.isInteger(Number(merged.position)) ? Number(merged.position) : 0,
    merged.is_archived ?? merged.isArchived ?? false,
    merged.tax_rate ?? merged.taxRate ?? 0,
    merged.preparation_time_minutes ?? merged.preparationTimeMinutes ?? null,
    merged.food_type ?? merged.foodType ?? (merged.veg === false ? 'non_veg' : 'veg'),
    merged.visibility ?? 'public',
    Number.isInteger(Number(merged.version)) ? Number(merged.version) : 1,
  ]
}

async function insertMenuEvent(client, {
  restaurantId,
  entityType,
  entityId,
  action,
  resourceVersion = 1,
}) {
  const eventId = crypto.randomUUID()
  const payload = JSON.stringify(buildCanonicalEnvelope({
    eventId,
    type: 'MENU_CHANGED',
    version: 1,
    restaurantId,
    entityType,
    entityId,
    action,
    resourceVersion,
    time: new Date().toISOString(),
  }))

  await client.query(
    `INSERT INTO realtime_outbox
       (id, restaurant_id, order_id, entity_type, entity_id, event_type, payload)
     VALUES ($1::uuid, $2::uuid, NULL, $3, $4, 'MENU_CHANGED', $5::jsonb)`,
    [eventId, restaurantId, entityType, entityId, payload],
  )
  return eventId
}

async function withTransaction(callback) {
  const client = await getTxPool().connect()
  try {
    await client.query('BEGIN')
    const result = await callback(client)
    await client.query('COMMIT')
    return result
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {})
    throw error
  } finally {
    client.release()
  }
}

function validationError(message, code = 'VALIDATION') {
  return Object.assign(new Error(message), { code })
}

export async function createMenuItemAtomic(restaurantId, item) {
  if (!item?.id) item = { ...item, id: crypto.randomUUID() }
  const values = itemValues(item)
  if (!values[1]) throw validationError('name is required')

  return withTransaction(async client => {
    const result = await client.query(
      `INSERT INTO menu_items
         (id, restaurant_id, category_id, name, description, price, image, image_key,
          available, veg, tags, add_ons, variants, is_published, image_shape,
          position, is_archived, tax_rate, preparation_time_minutes, food_type,
          visibility, version)
       VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5, $6, $7, $8,
               $9, $10, $11::jsonb, $12::jsonb, $13::jsonb, $14, $15,
               $16, $17, $18, $19, $20, $21, $22)
       RETURNING *`,
      [item.id, restaurantId, ...values],
    )
    const row = result.rows[0]
    await insertMenuEvent(client, {
      restaurantId,
      entityType: 'item',
      entityId: row.id,
      action: 'created',
      resourceVersion: row.version,
    })
    return row
  })
}

export async function upsertMenuItemsAtomic(restaurantId, items) {
  if (!Array.isArray(items) || items.length === 0) {
    throw validationError('items array is required')
  }

  return withTransaction(async client => {
    const rows = []
    for (const input of items) {
      const id = input?.id || crypto.randomUUID()
      const currentResult = await client.query(
        'SELECT * FROM menu_items WHERE id = $1::uuid FOR UPDATE',
        [id],
      )
      const current = currentResult.rows[0]
      if (current && current.restaurant_id !== restaurantId) {
        throw validationError('One or more items belong to a different restaurant', 'CROSS_TENANT')
      }

      const values = itemValues({ ...input, id }, current ?? {})
      if (!values[1]) throw validationError('name is required')

      let result
      if (current) {
        values[19] = Number(current.version || 1) + 1
        result = await client.query(
          `UPDATE menu_items
              SET category_id = $2::uuid, name = $3, description = $4, price = $5,
                  image = $6, image_key = $7, available = $8, veg = $9,
                  tags = $10::jsonb, add_ons = $11::jsonb, variants = $12::jsonb,
                  is_published = $13, image_shape = $14, position = $15,
                  is_archived = $16, tax_rate = $17,
                  preparation_time_minutes = $18, food_type = $19, visibility = $20,
                  version = $21, updated_at = now()
            WHERE id = $1::uuid
            RETURNING *`,
          [id, ...values],
        )
      } else {
        result = await client.query(
          `INSERT INTO menu_items
             (id, restaurant_id, category_id, name, description, price, image, image_key,
              available, veg, tags, add_ons, variants, is_published, image_shape,
              position, is_archived, tax_rate, preparation_time_minutes, food_type,
              visibility, version)
           VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5, $6, $7, $8,
                   $9, $10, $11::jsonb, $12::jsonb, $13::jsonb, $14, $15,
                   $16, $17, $18, $19, $20, $21, $22)
           RETURNING *`,
          [id, restaurantId, ...values],
        )
      }
      const row = result.rows[0]
      rows.push(row)
      await insertMenuEvent(client, {
        restaurantId,
        entityType: 'item',
        entityId: row.id,
        action: current ? 'updated' : 'created',
        resourceVersion: row.version,
      })
    }
    return rows
  })
}

export async function updateMenuItemAtomic(id, patch) {
  return withTransaction(async client => {
    const currentResult = await client.query(
      'SELECT * FROM menu_items WHERE id = $1::uuid FOR UPDATE',
      [id],
    )
    const current = currentResult.rows[0]
    if (!current) return null
    const restaurantId = current.restaurant_id
    const merged = { ...current, ...patch, id }
    const values = itemValues(merged, current)
    const nextVersion = Number(current.version || 1) + 1
    values[19] = nextVersion

    const result = await client.query(
      `UPDATE menu_items
          SET category_id = $2::uuid, name = $3, description = $4, price = $5,
              image = $6, image_key = $7, available = $8, veg = $9,
              tags = $10::jsonb, add_ons = $11::jsonb, variants = $12::jsonb,
              is_published = $13, image_shape = $14, position = $15,
              is_archived = $16, tax_rate = $17,
              preparation_time_minutes = $18, food_type = $19, visibility = $20,
              version = $21, updated_at = now()
        WHERE id = $1::uuid
        RETURNING *`,
      [id, ...values],
    )
    const row = result.rows[0]
    await insertMenuEvent(client, {
      restaurantId,
      entityType: 'item',
      entityId: id,
      action: 'updated',
      resourceVersion: row.version,
    })
    return row
  })
}

export async function deleteMenuItemAtomic(id) {
  return withTransaction(async client => {
    const currentResult = await client.query(
      'SELECT restaurant_id FROM menu_items WHERE id = $1::uuid FOR UPDATE',
      [id],
    )
    const current = currentResult.rows[0]
    if (!current) return null
    await client.query('DELETE FROM menu_items WHERE id = $1::uuid', [id])
    await insertMenuEvent(client, {
      restaurantId: current.restaurant_id,
      entityType: 'item',
      entityId: id,
      action: 'deleted',
    })
    return { success: true, restaurantId: current.restaurant_id }
  })
}

export async function archiveMenuItemAtomic(id, archived = true) {
  const row = await updateMenuItemAtomic(id, {
    is_archived: Boolean(archived),
    ...(archived ? { is_published: false } : {}),
  })
  return row
}

export async function duplicateMenuItemAtomic(id, overrides = {}) {
  return withTransaction(async client => {
    const sourceResult = await client.query(
      'SELECT * FROM menu_items WHERE id = $1::uuid FOR UPDATE',
      [id],
    )
    const source = sourceResult.rows[0]
    if (!source) return null
    const copyId = crypto.randomUUID()
    const copy = {
      ...source,
      ...overrides,
      id: copyId,
      name: overrides.name ?? `Copy of ${source.name}`,
      is_archived: false,
      is_published: false,
      version: 1,
    }
    const values = itemValues(copy, source)
    values[14] = false
    values[19] = 1
    const result = await client.query(
      `INSERT INTO menu_items
         (id, restaurant_id, category_id, name, description, price, image, image_key,
          available, veg, tags, add_ons, variants, is_published, image_shape,
          position, is_archived, tax_rate, preparation_time_minutes, food_type,
          visibility, version)
       VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5, $6, $7, $8,
               $9, $10, $11::jsonb, $12::jsonb, $13::jsonb, $14, $15,
               $16, $17, $18, $19, $20, $21, $22)
       RETURNING *`,
      [copyId, source.restaurant_id, ...values],
    )
    const row = result.rows[0]
    await insertMenuEvent(client, {
      restaurantId: source.restaurant_id,
      entityType: 'item',
      entityId: row.id,
      action: 'duplicated',
      resourceVersion: row.version,
    })
    return row
  })
}

export async function toggleMenuItemAvailabilityAtomic(id, available) {
  return updateMenuItemAtomic(id, { available: Boolean(available) })
}

export async function reorderMenuItemsAtomic(restaurantId, items) {
  if (!Array.isArray(items) || items.length === 0) {
    throw validationError('items array is required')
  }
  return withTransaction(async client => {
    const ids = items.map(item => item?.id).filter(Boolean)
    const owned = await client.query(
      'SELECT id FROM menu_items WHERE restaurant_id = $1::uuid AND id = ANY($2::uuid[]) FOR UPDATE',
      [restaurantId, ids],
    )
    if (owned.rows.length !== ids.length) {
      throw validationError('One or more items do not belong to this restaurant', 'CROSS_TENANT')
    }
    for (const item of items) {
      if (!Number.isInteger(Number(item.position)) || Number(item.position) < 0) {
        throw validationError('Each item position must be a non-negative integer')
      }
      await client.query(
        `UPDATE menu_items
            SET position = $1, version = version + 1, updated_at = now()
          WHERE id = $2::uuid AND restaurant_id = $3::uuid`,
        [Number(item.position), item.id, restaurantId],
      )
    }
    await insertMenuEvent(client, {
      restaurantId,
      entityType: 'menu',
      entityId: restaurantId,
      action: 'items_reordered',
    })
    return getMenuItemsForRestaurant(client, restaurantId, { includeArchived: true })
  })
}

export async function reorderMenuCategoriesAtomic(restaurantId, categories) {
  if (!Array.isArray(categories) || categories.length === 0) {
    throw validationError('categories array is required')
  }
  return withTransaction(async client => {
    const ids = categories.map(category => category?.id).filter(Boolean)
    const owned = await client.query(
      'SELECT id FROM menu_categories WHERE restaurant_id = $1::uuid AND id = ANY($2::uuid[]) FOR UPDATE',
      [restaurantId, ids],
    )
    if (owned.rows.length !== ids.length) {
      throw validationError('One or more categories do not belong to this restaurant', 'CROSS_TENANT')
    }
    for (const category of categories) {
      if (!Number.isInteger(Number(category.position)) || Number(category.position) < 0) {
        throw validationError('Each category position must be a non-negative integer')
      }
      await client.query(
        `UPDATE menu_categories
            SET position = $1, updated_at = now()
          WHERE id = $2::uuid AND restaurant_id = $3::uuid`,
        [Number(category.position), category.id, restaurantId],
      )
    }
    await insertMenuEvent(client, {
      restaurantId,
      entityType: 'menu',
      entityId: restaurantId,
      action: 'categories_reordered',
    })
    return getMenuCategoriesForRestaurant(client, restaurantId)
  })
}

export async function upsertMenuCategoryAtomic(restaurantId, category) {
  return withTransaction(async client => {
    let row
    if (category.id) {
      const result = await client.query(
        'SELECT * FROM menu_categories WHERE id = $1::uuid FOR UPDATE',
        [category.id],
      )
      const current = result.rows[0]
      if (current && current.restaurant_id !== restaurantId) {
        throw validationError('Category belongs to a different restaurant', 'CROSS_TENANT')
      }
      if (current) {
        const updated = await client.query(
          `UPDATE menu_categories
              SET name = $2, emoji = $3, position = $4, updated_at = now()
            WHERE id = $1::uuid
            RETURNING *`,
          [
            category.id,
            String(category.name ?? current.name).trim(),
            category.emoji ?? current.emoji,
            Number.isInteger(Number(category.position)) ? Number(category.position) : current.position,
          ],
        )
        row = updated.rows[0]
      }
    }
    if (!row) {
      const id = category.id || crypto.randomUUID()
      const created = await client.query(
        `INSERT INTO menu_categories (id, restaurant_id, name, emoji, position)
         VALUES ($1::uuid, $2::uuid, $3, $4, $5)
         RETURNING *`,
        [
          id,
          restaurantId,
          String(category.name ?? '').trim(),
          category.emoji ?? '🍽️',
          Number.isInteger(Number(category.position)) ? Number(category.position) : 0,
        ],
      )
      row = created.rows[0]
    }
    if (!row.name) throw validationError('name is required')
    await insertMenuEvent(client, {
      restaurantId,
      entityType: 'category',
      entityId: row.id,
      action: category.id ? 'updated' : 'created',
    })
    return row
  })
}

export async function deleteMenuCategoryAtomic(id) {
  return withTransaction(async client => {
    const result = await client.query(
      'SELECT restaurant_id FROM menu_categories WHERE id = $1::uuid FOR UPDATE',
      [id],
    )
    const current = result.rows[0]
    if (!current) return null
    await client.query('DELETE FROM menu_categories WHERE id = $1::uuid', [id])
    await insertMenuEvent(client, {
      restaurantId: current.restaurant_id,
      entityType: 'category',
      entityId: id,
      action: 'deleted',
    })
    return { success: true, restaurantId: current.restaurant_id }
  })
}

export async function getMenuItemsForRestaurant(client, restaurantId, {
  includeArchived = true,
  publishedOnly = false,
  search = '',
  categoryId = null,
  limit = null,
  offset = 0,
} = {}) {
  const params = [restaurantId]
  const clauses = ['restaurant_id = $1::uuid']
  if (!includeArchived) clauses.push('is_archived = false')
  if (publishedOnly) clauses.push('is_published = true')
  if (categoryId) {
    params.push(categoryId)
    clauses.push(`category_id = $${params.length}::uuid`)
  }
  if (search) {
    params.push(`%${search}%`)
    clauses.push(`(name ILIKE $${params.length} OR COALESCE(description, '') ILIKE $${params.length})`)
  }
  let pagination = ''
  if (limit != null) {
    params.push(limit)
    pagination += ` LIMIT $${params.length}`
    params.push(offset)
    pagination += ` OFFSET $${params.length}`
  }
  const { rows } = await client.query(
    `SELECT * FROM menu_items
      WHERE ${clauses.join(' AND ')}
      ORDER BY position ASC, created_at ASC, id ASC${pagination}`,
    params,
  )
  return rows
}

export async function listMenuItems(restaurantId, options = {}) {
  const pool = getPool()
  const client = await pool.connect()
  try {
    const rows = await getMenuItemsForRestaurant(client, restaurantId, options)
    const countParams = [restaurantId]
    const countClauses = ['restaurant_id = $1::uuid']
    if (!options.includeArchived) countClauses.push('is_archived = false')
    if (options.publishedOnly) countClauses.push('is_published = true')
    if (options.categoryId) {
      countParams.push(options.categoryId)
      countClauses.push(`category_id = $${countParams.length}::uuid`)
    }
    if (options.search) {
      countParams.push(`%${options.search}%`)
      countClauses.push(`(name ILIKE $${countParams.length} OR COALESCE(description, '') ILIKE $${countParams.length})`)
    }
    const count = await client.query(
      `SELECT count(*)::int AS count FROM menu_items WHERE ${countClauses.join(' AND ')}`,
      countParams,
    )
    return { rows, total: count.rows[0]?.count ?? 0 }
  } finally {
    client.release()
  }
}

export async function getMenuItemForRestaurant(restaurantId, itemId) {
  const pool = getPool()
  const { rows } = await pool.query(
    `SELECT * FROM menu_items
      WHERE restaurant_id = $1::uuid AND id = $2::uuid
      LIMIT 1`,
    [restaurantId, itemId],
  )
  return rows[0] ?? null
}

export async function getMenuCategoriesForRestaurant(client, restaurantId) {
  const { rows } = await client.query(
    `SELECT * FROM menu_categories
      WHERE restaurant_id = $1::uuid
      ORDER BY position ASC, created_at ASC, id ASC`,
    [restaurantId],
  )
  return rows
}

export async function listMenuCategories(restaurantId) {
  const pool = getPool()
  const { rows } = await pool.query(
    `SELECT * FROM menu_categories
      WHERE restaurant_id = $1::uuid
      ORDER BY position ASC, created_at ASC, id ASC`,
    [restaurantId],
  )
  return rows
}

export async function listMenuGallery(restaurantId, itemId) {
  const pool = getPool()
  const { rows } = await pool.query(
    `SELECT g.*
       FROM menu_item_gallery g
        JOIN menu_items i
          ON i.id = g.menu_item_id
         AND i.restaurant_id = g.restaurant_id
      WHERE g.restaurant_id = $1::uuid
        AND g.menu_item_id = $2::uuid
      ORDER BY g.position ASC, g.created_at ASC, g.id ASC`,
    [restaurantId, itemId],
  )
  return rows
}

export async function listMenuGalleryForItems(restaurantId, itemIds) {
  if (!itemIds.length) return []
  const pool = getPool()
  const { rows } = await pool.query(
    `SELECT * FROM menu_item_gallery
       WHERE restaurant_id = $1::uuid
         AND menu_item_id = ANY($2::uuid[])
      ORDER BY position ASC, created_at ASC, id ASC`,
    [restaurantId, itemIds],
  )
  return rows
}

export async function addMenuGalleryReferenceAtomic({
  restaurantId,
  itemId,
  objectKey,
  publicUrl,
  altText = null,
  position = 0,
}) {
  return withTransaction(async client => {
    const item = await client.query(
      'SELECT id FROM menu_items WHERE id = $1::uuid AND restaurant_id = $2::uuid FOR UPDATE',
      [itemId, restaurantId],
    )
    if (!item.rows[0]) throw validationError('Menu item not found', 'NOT_FOUND')
    const expectedPrefix = `restaurants/${encodeURIComponent(restaurantId)}/menu/`
    if (typeof objectKey !== 'string' || !objectKey.startsWith(expectedPrefix)) {
      throw validationError('Image key does not belong to this restaurant', 'CROSS_TENANT')
    }
    const result = await client.query(
      `INSERT INTO menu_item_gallery
        (restaurant_id, menu_item_id, object_key, public_url, alt_text, position)
       VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6)
       ON CONFLICT (object_key) DO UPDATE
         SET public_url = EXCLUDED.public_url,
             alt_text = EXCLUDED.alt_text,
             position = EXCLUDED.position,
             updated_at = now()
       RETURNING *`,
      [restaurantId, itemId, objectKey, publicUrl, altText, Number(position) || 0],
    )
    const row = result.rows[0]
    await insertMenuEvent(client, {
      restaurantId,
      entityType: 'item',
      entityId: itemId,
      action: 'gallery_changed',
    })
    return row
  })
}

export async function replaceMenuItemImageAtomic({
  restaurantId,
  itemId,
  objectKey,
  publicUrl,
  imageShape,
}) {
  return withTransaction(async client => {
    const currentResult = await client.query(
      'SELECT * FROM menu_items WHERE id = $1::uuid AND restaurant_id = $2::uuid FOR UPDATE',
      [itemId, restaurantId],
    )
    const current = currentResult.rows[0]
    if (!current) throw validationError('Menu item not found', 'NOT_FOUND')
    const expectedPrefix = `restaurants/${encodeURIComponent(restaurantId)}/menu/`
    if (!objectKey.startsWith(expectedPrefix)) {
      throw validationError('Image key does not belong to this restaurant', 'CROSS_TENANT')
    }
    const result = await client.query(
      `UPDATE menu_items
          SET image = $3, image_key = $4, image_shape = COALESCE($5, image_shape),
              version = version + 1, updated_at = now()
        WHERE id = $1::uuid AND restaurant_id = $2::uuid
        RETURNING *`,
      [itemId, restaurantId, publicUrl, objectKey, imageShape ?? null],
    )
    if (current.image_key) {
      await client.query(
        `DELETE FROM menu_item_gallery
          WHERE restaurant_id = $1::uuid
            AND menu_item_id = $2::uuid
            AND object_key = $3`,
        [restaurantId, itemId, current.image_key],
      )
    }
    await client.query(
      `INSERT INTO menu_item_gallery
        (restaurant_id, menu_item_id, object_key, public_url, position)
       VALUES ($1::uuid, $2::uuid, $3, $4, 0)
       ON CONFLICT (object_key) DO UPDATE
         SET public_url = EXCLUDED.public_url, updated_at = now()`,
      [restaurantId, itemId, objectKey, publicUrl],
    )
    await insertMenuEvent(client, {
      restaurantId,
      entityType: 'item',
      entityId: itemId,
      action: 'image_replaced',
      resourceVersion: result.rows[0].version,
    })
    return { row: result.rows[0], oldKey: current.image_key ?? null }
  })
}

export async function deleteMenuGalleryReferenceAtomic(restaurantId, galleryId) {
  return withTransaction(async client => {
    const result = await client.query(
      `DELETE FROM menu_item_gallery
        WHERE id = $1::uuid AND restaurant_id = $2::uuid
        RETURNING *`,
      [galleryId, restaurantId],
    )
    const row = result.rows[0]
    if (!row) return null
    await insertMenuEvent(client, {
      restaurantId,
      entityType: 'item',
      entityId: row.menu_item_id,
      action: 'gallery_changed',
    })
    return row
  })
}