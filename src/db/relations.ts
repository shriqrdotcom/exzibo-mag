import { relations } from 'drizzle-orm'
import {
  restaurants,
  restaurantMembers,
  menuCategories,
  menuItems,
  orders,
  orderItems,
  bookings,
  restaurantAbout,
  restaurantSettings,
  tableNumbers,
  auditLogs,
} from './schema'

export const restaurantsRelations = relations(restaurants, ({ many, one }) => ({
  members:    many(restaurantMembers),
  categories: many(menuCategories),
  menuItems:  many(menuItems),
  orders:     many(orders),
  bookings:   many(bookings),
  about:      one(restaurantAbout, {
    fields:     [restaurants.id],
    references: [restaurantAbout.restaurantId],
  }),
  settings:   one(restaurantSettings, {
    fields:     [restaurants.id],
    references: [restaurantSettings.restaurantId],
  }),
  tables:     many(tableNumbers),
  auditLogs:  many(auditLogs),
}))

export const restaurantMembersRelations = relations(restaurantMembers, ({ one }) => ({
  restaurant: one(restaurants, {
    fields:     [restaurantMembers.restaurantId],
    references: [restaurants.id],
  }),
}))

export const menuCategoriesRelations = relations(menuCategories, ({ one, many }) => ({
  restaurant: one(restaurants, {
    fields:     [menuCategories.restaurantId],
    references: [restaurants.id],
  }),
  items: many(menuItems),
}))

export const menuItemsRelations = relations(menuItems, ({ one, many }) => ({
  restaurant: one(restaurants, {
    fields:     [menuItems.restaurantId],
    references: [restaurants.id],
  }),
  category: one(menuCategories, {
    fields:     [menuItems.categoryId],
    references: [menuCategories.id],
  }),
  orderItems: many(orderItems),
}))

export const ordersRelations = relations(orders, ({ one, many }) => ({
  restaurant: one(restaurants, {
    fields:     [orders.restaurantId],
    references: [restaurants.id],
  }),
  items: many(orderItems),
}))

export const orderItemsRelations = relations(orderItems, ({ one }) => ({
  order: one(orders, {
    fields:     [orderItems.orderId],
    references: [orders.id],
  }),
  menuItem: one(menuItems, {
    fields:     [orderItems.menuItemId],
    references: [menuItems.id],
  }),
}))

export const bookingsRelations = relations(bookings, ({ one }) => ({
  restaurant: one(restaurants, {
    fields:     [bookings.restaurantId],
    references: [restaurants.id],
  }),
}))

export const restaurantAboutRelations = relations(restaurantAbout, ({ one }) => ({
  restaurant: one(restaurants, {
    fields:     [restaurantAbout.restaurantId],
    references: [restaurants.id],
  }),
}))

export const restaurantSettingsRelations = relations(restaurantSettings, ({ one }) => ({
  restaurant: one(restaurants, {
    fields:     [restaurantSettings.restaurantId],
    references: [restaurants.id],
  }),
}))

export const tableNumbersRelations = relations(tableNumbers, ({ one }) => ({
  restaurant: one(restaurants, {
    fields:     [tableNumbers.restaurantId],
    references: [restaurants.id],
  }),
}))

export const auditLogsRelations = relations(auditLogs, ({ one }) => ({
  restaurant: one(restaurants, {
    fields:     [auditLogs.restaurantId],
    references: [restaurants.id],
  }),
}))
