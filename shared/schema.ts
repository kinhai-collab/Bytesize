import { pgTable, text, serial, timestamp, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// ── VIDEOS TABLE (original, unchanged) ──────────────────────────────────────
export const videos = pgTable("videos", {
  id: serial("id").primaryKey(),
  url: text("url").notNull(),
  title: text("title").notNull(),
  thumbnailUrl: text("thumbnail_url"),
  sourceChannelId: text("source_channel_id"),
  sourceChannelName: text("source_channel_name"),
  duration: text("duration"),
  transcript: text("transcript"), // Full transcript
  summary: text("summary"), // AI Summary
  processed: boolean("processed").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertVideoSchema = createInsertSchema(videos).omit({
  id: true,
  createdAt: true,
  processed: true,
});

export type Video = typeof videos.$inferSelect;
export type InsertVideo = z.infer<typeof insertVideoSchema>;

// ── CHANNELS TABLE (new) ─────────────────────────────────────────────────────
export const channels = pgTable("channels", {
  id: serial("id").primaryKey(),
  channelUrl: text("channel_url").notNull(), // URL the user pasted
  channelName: text("channel_name").notNull(), // Display name from YouTube
  channelId: text("channel_id").notNull(), // YouTube's internal channel ID
  channelThumbnailUrl: text("channel_thumbnail_url"), // Channel avatar from YouTube
  lastCheckedAt: timestamp("last_checked_at").defaultNow(), // When we last checked for new videos
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertChannelSchema = createInsertSchema(channels).omit({
  id: true,
  createdAt: true,
});

export type Channel = typeof channels.$inferSelect;
export type InsertChannel = z.infer<typeof insertChannelSchema>;

export * from "./models/chat";
