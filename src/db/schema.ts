import {
  pgTable,
  uuid,
  text,
  boolean,
  integer,
  numeric,
  jsonb,
  timestamp,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'

// ── Timestamps helper ────────────────────────────────────────────────────────
const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .default(sql`now()`),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .default(sql`now()`),
}

// ── restaurants ──────────────────────────────────────────────────────────────
export const restaurants = pgTable(
  'restaurants',
  {
    id:                uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    uid:               text('uid').notNull(),
    slug:              text('slug').notNull(),
    name:              text('name').notNull(),

    // Auth — nullable until Better Auth is added
    ownerId:           uuid('owner_id'),

    status:            text('status').notNull().default('active'),
    plan:              text('plan').notNull().default('STARTER'),
    place:             text('place'),
    note:              text('note'),
    accentColor:       text('accent_color').default('#6366F1'),
    currency:          text('currency').default('INR'),

    phone:             text('phone'),
    gst:               text('gst'),
    description:       text('description'),
    chefInfo:          text('chef_info'),
    servantInfo:       text('servant_info'),
    socialLinks:       jsonb('social_links').default({}),
    rating:            text('rating'),
    location:          text('location'),
    additionalInfo:    text('additional_info'),
    digitalMenuLink:   text('digital_menu_link'),
    digitalServiceBell: boolean('digital_service_bell').default(false),
    planLimits:        jsonb('plan_limits').default({}),

    // Carousel / hero images (JSON array of keys for future R2 storage)
    images:            jsonb('images').default([]),
    // Logo stored as an object-storage key, not a URL
    logoKey:           text('logo_key'),
    // Compatibility columns — mirrors Supabase field names so frontend response shape is unchanged
    logo:              text('logo'),
    tableNumbers:      jsonb('table_numbers').default([]),

    menuFilters:       jsonb('menu_filters').default({}),
    filtersEnabled:    jsonb('filters_enabled').default({}),

    isDeleted:         boolean('is_deleted').notNull().default(false),
    deletedAt:         timestamp('deleted_at', { withTimezone: true }),
    startDate:         timestamp('start_date', { withTimezone: true }),
    endDate:           timestamp('end_date', { withTimezone: true }),

    ...timestamps,
  },
  (t) => [
    uniqueIndex('restaurants_uid_unique').on(t.uid),
    uniqueIndex('restaurants_slug_unique').on(t.slug),
    index('restaurants_owner_id_idx').on(t.ownerId),
    index('restaurants_status_idx').on(t.status),
    index('restaurants_created_at_idx').on(t.createdAt),
    index('restaurants_is_deleted_idx').on(t.isDeleted),
  ]
)

// ── restaurant_members (team) ────────────────────────────────────────────────
export const restaurantMembers = pgTable(
  'restaurant_members',
  {
    id:           uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    restaurantId: uuid('restaurant_id').notNull().references(() => restaurants.id, { onDelete: 'cascade' }),

    // Auth — nullable until Better Auth is added
    userId:       uuid('user_id'),
    ownerId:      uuid('owner_id'),

    name:         text('name').notNull(),
    email:        text('email'),
    role:         text('role').notNull(),           // owner | admin | manager | staff | menu_studio
    category:     text('category'),
    department:   text('department'),
    avatarKey:    text('avatar_key'),              // object-storage key for future R2
    phone:        text('phone'),
    active:       boolean('active').notNull().default(true),

    ...timestamps,
  },
  (t) => [
    index('restaurant_members_restaurant_id_idx').on(t.restaurantId),
    index('restaurant_members_user_id_idx').on(t.userId),
    index('restaurant_members_email_idx').on(t.email),
  ]
)

// ── menu_categories ──────────────────────────────────────────────────────────
export const menuCategories = pgTable(
  'menu_categories',
  {
    id:           uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    restaurantId: uuid('restaurant_id').notNull().references(() => restaurants.id, { onDelete: 'cascade' }),
    name:         text('name').notNull(),
    emoji:        text('emoji').default('🍽️'),
    position:     integer('position').notNull().default(0),

    ...timestamps,
  },
  (t) => [
    index('menu_categories_restaurant_id_idx').on(t.restaurantId),
    index('menu_categories_position_idx').on(t.restaurantId, t.position),
  ]
)

// ── menu_items ───────────────────────────────────────────────────────────────
export const menuItems = pgTable(
  'menu_items',
  {
    id:           uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    restaurantId: uuid('restaurant_id').notNull().references(() => restaurants.id, { onDelete: 'cascade' }),
    categoryId:   uuid('category_id').references(() => menuCategories.id, { onDelete: 'set null' }),

    name:         text('name').notNull(),
    description:  text('description'),
    price:        numeric('price', { precision: 10, scale: 2 }).notNull().default('0'),

    // Compatibility alias: full Supabase Storage URL (mirrors Supabase 'image' column).
    // Written by shadow-writes so Neon rows are response-shape compatible with Supabase rows.
    image:        text('image'),

    // Reserved for future Cloudflare R2 migration (object-storage key, not a URL).
    imageKey:     text('image_key'),

    available:    boolean('available').notNull().default(true),
    veg:          boolean('veg').notNull().default(true),
    tags:         jsonb('tags').default([]),
    addOns:       jsonb('add_ons').default([]),
    isPublished:  boolean('is_published').notNull().default(false),
    imageShape:   text('image_shape').notNull().default('vertical'),

    ...timestamps,
  },
  (t) => [
    index('menu_items_restaurant_id_idx').on(t.restaurantId),
    index('menu_items_category_id_idx').on(t.categoryId),
    index('menu_items_is_published_idx').on(t.restaurantId, t.isPublished),
    index('menu_items_created_at_idx').on(t.createdAt),
  ]
)

// ── orders ───────────────────────────────────────────────────────────────────
export const orders = pgTable(
  'orders',
  {
    id:               text('id').primaryKey(),           // 9-digit string from client
    restaurantId:     uuid('restaurant_id').notNull().references(() => restaurants.id, { onDelete: 'cascade' }),
    orderNumber:      text('order_number').notNull(),    // mirrors id for clarity
    tableNumber:      text('table_number'),
    customerName:     text('customer_name'),
    customerPhone:    text('customer_phone'),
    customerLocation: text('customer_location'),
    status:           text('status').notNull().default('pending'),
    total:            numeric('total', { precision: 10, scale: 2 }).notNull().default('0'),
    notes:            text('notes'),

    ...timestamps,
  },
  (t) => [
    index('orders_restaurant_id_idx').on(t.restaurantId),
    index('orders_order_number_idx').on(t.orderNumber),
    index('orders_status_idx').on(t.restaurantId, t.status),
    index('orders_created_at_idx').on(t.createdAt),
  ]
)

// ── order_items ──────────────────────────────────────────────────────────────
export const orderItems = pgTable(
  'order_items',
  {
    id:         uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    orderId:    text('order_id').notNull().references(() => orders.id, { onDelete: 'cascade' }),
    menuItemId: uuid('menu_item_id').references(() => menuItems.id, { onDelete: 'set null' }),

    name:       text('name').notNull(),
    price:      numeric('price', { precision: 10, scale: 2 }).notNull().default('0'),
    quantity:   integer('quantity').notNull().default(1),
    veg:        boolean('veg').default(true),
    addOns:     jsonb('add_ons').default([]),
    notes:      text('notes'),

    createdAt:  timestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`),
  },
  (t) => [
    index('order_items_order_id_idx').on(t.orderId),
    index('order_items_menu_item_id_idx').on(t.menuItemId),
  ]
)

// ── bookings ─────────────────────────────────────────────────────────────────
export const bookings = pgTable(
  'bookings',
  {
    id:            text('id').primaryKey(),
    restaurantId:  uuid('restaurant_id').notNull().references(() => restaurants.id, { onDelete: 'cascade' }),
    customerName:  text('customer_name').notNull().default(''),
    customerPhone: text('customer_phone'),
    customerEmail: text('customer_email'),
    guests:        integer('guests').notNull().default(1),
    date:          text('date'),
    time:          text('time'),
    occasion:      text('occasion'),
    seating:       text('seating'),
    notes:         text('notes'),
    status:        text('status').notNull().default('pending'),

    ...timestamps,
  },
  (t) => [
    index('bookings_restaurant_id_idx').on(t.restaurantId),
    index('bookings_status_idx').on(t.restaurantId, t.status),
    index('bookings_created_at_idx').on(t.createdAt),
  ]
)

// ── restaurant_about ─────────────────────────────────────────────────────────
export const restaurantAbout = pgTable(
  'restaurant_about',
  {
    id:           uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    restaurantId: uuid('restaurant_id').notNull().references(() => restaurants.id, { onDelete: 'cascade' }),
    storyText:    text('story_text'),
    // Image keys for future R2 storage (not Supabase Storage URLs)
    image1Key:    text('image_1_key'),
    image2Key:    text('image_2_key'),
    image3Key:    text('image_3_key'),
    image4Key:    text('image_4_key'),

    ...timestamps,
  },
  (t) => [
    uniqueIndex('restaurant_about_restaurant_id_unique').on(t.restaurantId),
  ]
)

// ── restaurant_settings ──────────────────────────────────────────────────────
export const restaurantSettings = pgTable(
  'restaurant_settings',
  {
    id:           uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    restaurantId: uuid('restaurant_id').notNull().references(() => restaurants.id, { onDelete: 'cascade' }),
    globalConfig: jsonb('global_config').notNull().default({}),

    ...timestamps,
  },
  (t) => [
    uniqueIndex('restaurant_settings_restaurant_id_unique').on(t.restaurantId),
  ]
)

// ── table_numbers ────────────────────────────────────────────────────────────
export const tableNumbers = pgTable(
  'table_numbers',
  {
    id:           uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    restaurantId: uuid('restaurant_id').notNull().references(() => restaurants.id, { onDelete: 'cascade' }),
    number:       integer('number').notNull(),
    label:        text('label'),
    isActive:     boolean('is_active').notNull().default(true),

    createdAt:    timestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`),
  },
  (t) => [
    index('table_numbers_restaurant_id_idx').on(t.restaurantId),
    uniqueIndex('table_numbers_restaurant_number_unique').on(t.restaurantId, t.number),
  ]
)

// ── audit_logs ───────────────────────────────────────────────────────────────
export const auditLogs = pgTable(
  'audit_logs',
  {
    id:           uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    restaurantId: uuid('restaurant_id').references(() => restaurants.id, { onDelete: 'set null' }),

    // Auth — nullable until Better Auth is added
    userId:       uuid('user_id'),

    action:       text('action').notNull(),      // e.g. 'create', 'update', 'delete'
    entityType:   text('entity_type').notNull(), // e.g. 'restaurant', 'menu_item'
    entityId:     text('entity_id'),
    oldData:      jsonb('old_data'),
    newData:      jsonb('new_data'),
    ipAddress:    text('ip_address'),

    createdAt:    timestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`),
  },
  (t) => [
    index('audit_logs_restaurant_id_idx').on(t.restaurantId),
    index('audit_logs_user_id_idx').on(t.userId),
    index('audit_logs_entity_type_idx').on(t.entityType),
    index('audit_logs_created_at_idx').on(t.createdAt),
  ]
)
