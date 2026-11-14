import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
export const sessions = sqliteTable("run_sessions", {
 id: text("id").primaryKey(), userId: text("user_id").notNull(), data: text("data").notNull(), updatedAt: text("updated_at").notNull()
});

export const trainingShares = sqliteTable("training_shares", {
 ownerId: text("owner_id").primaryKey(),
 token: text("token").notNull().unique(),
 createdAt: text("created_at").notNull()
});

export const garminSync = sqliteTable("garmin_sync", {
 userId: text("user_id").primaryKey(),
 data: text("data").notNull(),
 lockUntil: integer("lock_until").notNull().default(0)
});
