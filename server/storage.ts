// We're importing our database tables and types
// "videos" and "channels" are our database tables
// "Video", "InsertVideo", "Channel", "InsertChannel" describe what those objects look like
import {
  videos,
  type Video,
  type InsertVideo,
  channels,
  type Channel,
  type InsertChannel,
} from "@shared/schema";

// "db" is our database connection
import { db } from "./db";

// "eq" means "equals", "desc" means "descending order" (newest first)
import { eq, desc } from "drizzle-orm";

// This is the "interface" — think of it as a menu of all available database functions
// It describes WHAT functions exist, but not HOW they work yet
export interface IStorage {
  createVideo(video: InsertVideo): Promise<Video>; // Save a new video
  getVideos(): Promise<Video[]>; // Get all videos
  getVideo(id: number): Promise<Video | undefined>; // Get one specific video
  deleteVideo(id: number): Promise<void>; // Delete a video
  updateVideo(id: number, video: Partial<Video>): Promise<Video>; // Update a video

  createChannel(channel: InsertChannel): Promise<Channel>; // Save a new channel
  getChannels(): Promise<Channel[]>; // Get all saved channels
  updateChannelLastChecked(id: number): Promise<void>; // Record when we last checked
}

// This is the actual implementation — the HOW behind each function
export class DatabaseStorage implements IStorage {
  // ── VIDEO FUNCTIONS (these already existed, unchanged) ──────────────────

  // Saves a new video to the database and returns it
  async createVideo(insertVideo: InsertVideo): Promise<Video> {
    const [video] = await db.insert(videos).values(insertVideo).returning();
    return video;
  }

  // Gets all videos, newest first
  async getVideos(): Promise<Video[]> {
    return await db.select().from(videos).orderBy(desc(videos.createdAt));
  }

  // Gets one specific video by its ID number
  async getVideo(id: number): Promise<Video | undefined> {
    const [video] = await db.select().from(videos).where(eq(videos.id, id));
    return video;
  }

  // Deletes a video by its ID number
  async deleteVideo(id: number): Promise<void> {
    await db.delete(videos).where(eq(videos.id, id));
  }

  // Updates specific fields of a video (only the fields you pass in)
  async updateVideo(id: number, video: Partial<Video>): Promise<Video> {
    const [updatedVideo] = await db
      .update(videos)
      .set(video)
      .where(eq(videos.id, id))
      .returning();
    return updatedVideo;
  }

  // ── CHANNEL FUNCTIONS (these are new) ───────────────────────────────────

  // Saves a new channel to the database and returns it
  async createChannel(insertChannel: InsertChannel): Promise<Channel> {
    const [channel] = await db
      .insert(channels)
      .values(insertChannel)
      .returning();
    return channel;
  }

  // Gets all saved channels, newest first
  async getChannels(): Promise<Channel[]> {
    return await db.select().from(channels).orderBy(desc(channels.createdAt));
  }

  // Updates the "last checked" time to RIGHT NOW for a specific channel
  // This lets us know which videos are "new" next time we check
  async updateChannelLastChecked(id: number): Promise<void> {
    await db
      .update(channels)
      .set({ lastCheckedAt: new Date() }) // new Date() = current time
      .where(eq(channels.id, id));
  }
}

// This creates ONE instance of DatabaseStorage that the whole app shares
// Think of it like one shared filing cabinet everyone uses
export const storage = new DatabaseStorage();
