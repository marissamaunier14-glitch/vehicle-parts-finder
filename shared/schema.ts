import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, decimal, jsonb, timestamp, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const vehicleMakes = pgTable("vehicle_makes", {
  id: integer("id").primaryKey(),
  name: text("name").notNull(),
  cachedAt: timestamp("cached_at").defaultNow(),
});

export const vehicleModels = pgTable("vehicle_models", {
  id: integer("id").primaryKey(),
  name: text("name").notNull(),
  makeId: integer("make_id").notNull(),
  cachedAt: timestamp("cached_at").defaultNow(),
});

export const vehicleYears = pgTable("vehicle_years", {
  id: integer("id").primaryKey(),
  name: text("name").notNull(),
  cachedAt: timestamp("cached_at").defaultNow(),
});

export const vehicleSearches = pgTable("vehicle_searches", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  yearId: integer("year_id"),
  makeId: integer("make_id"),
  modelId: integer("model_id"),
  yearName: text("year_name"),
  makeName: text("make_name"),
  modelName: text("model_name"),
  searchCount: integer("search_count").default(1),
  lastSearched: timestamp("last_searched").defaultNow(),
});

export const orders = pgTable("orders", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  customerName: text("customer_name").notNull(),
  customerEmail: text("customer_email").notNull(),
  customerPhone: text("customer_phone"),
  vehicleYear: text("vehicle_year").notNull(),
  vehicleMake: text("vehicle_make").notNull(),
  vehicleModel: text("vehicle_model").notNull(),
  items: jsonb("items").notNull(),
  totalPrice: decimal("total_price", { precision: 10, scale: 2 }).notNull(),
  status: text("status").notNull().default("pending"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export const insertOrderSchema = createInsertSchema(orders).omit({
  id: true,
  status: true,
  createdAt: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type InsertOrder = z.infer<typeof insertOrderSchema>;
export type Order = typeof orders.$inferSelect;
export type VehicleMake = typeof vehicleMakes.$inferSelect;
export type VehicleModel = typeof vehicleModels.$inferSelect;
export type VehicleYear = typeof vehicleYears.$inferSelect;
export type VehicleSearch = typeof vehicleSearches.$inferSelect;