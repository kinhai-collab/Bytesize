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
import { and, eq, desc } from "drizzle-orm";

function normalizeVideo(video: Video): Video {
  return video.summary && !video.processed ? { ...video, processed: true } : video;
}

// This is the "interface" — think of it as a menu of all available database functions
// It describes WHAT functions exist, but not HOW they work yet
export interface IStorage {
  createVideo(video: InsertVideo, userId: number): Promise<Video>; // Save a new video
  getVideos(userId: number): Promise<Video[]>; // Get all videos
  getVideo(id: number, userId: number): Promise<Video | undefined>; // Get one specific video
  deleteVideo(id: number, userId: number): Promise<void>; // Delete a video
  updateVideo(id: number, video: Partial<Video>, userId?: number): Promise<Video>; // Update a video

  createChannel(channel: InsertChannel, userId: number): Promise<Channel>; // Save a new channel
  getChannels(userId: number): Promise<Channel[]>; // Get all saved channels
  updateChannel(id: number, channel: Partial<Channel>, userId?: number): Promise<Channel>; // Update channel metadata
  deleteChannel(id: number, userId: number): Promise<void>; // Stop tracking a channel
  updateChannelLastChecked(id: number, userId?: number): Promise<void>; // Record when we last checked
}

// This is the actual implementation — the HOW behind each function
export class DatabaseStorage implements IStorage {
  // ── VIDEO FUNCTIONS (these already existed, unchanged) ──────────────────

  // Saves a new video to the database and returns it
  async createVideo(insertVideo: InsertVideo, userId: number): Promise<Video> {
    const [video] = await db
      .insert(videos)
      .values({ ...insertVideo, userId, processed: Boolean(insertVideo.summary) })
      .returning();
    return normalizeVideo(video);
  }

  // Gets all videos, newest first
  async getVideos(userId: number): Promise<Video[]> {
    const videoList = await db
      .select()
      .from(videos)
      .where(eq(videos.userId, userId))
      .orderBy(desc(videos.createdAt));
    return videoList.map(normalizeVideo);
  }

  // Gets one specific video by its ID number
  async getVideo(id: number, userId: number): Promise<Video | undefined> {
    const [video] = await db.select().from(videos).where(and(eq(videos.id, id), eq(videos.userId, userId)));
    return video ? normalizeVideo(video) : undefined;
  }

  // Deletes a video by its ID number
  async deleteVideo(id: number, userId: number): Promise<void> {
    await db.delete(videos).where(and(eq(videos.id, id), eq(videos.userId, userId)));
  }

  // Updates specific fields of a video (only the fields you pass in)
  async updateVideo(id: number, video: Partial<Video>, userId?: number): Promise<Video> {
    const [updatedVideo] = await db
      .update(videos)
      .set(video)
      .where(userId ? and(eq(videos.id, id), eq(videos.userId, userId)) : eq(videos.id, id))
      .returning();
    return normalizeVideo(updatedVideo);
  }

  // ── CHANNEL FUNCTIONS (these are new) ───────────────────────────────────

  // Saves a new channel to the database and returns it
  async createChannel(insertChannel: InsertChannel, userId: number): Promise<Channel> {
    const [channel] = await db
      .insert(channels)
      .values({ ...insertChannel, userId })
      .returning();
    return channel;
  }

  // Gets all saved channels, newest first
  async getChannels(userId: number): Promise<Channel[]> {
    return await db.select().from(channels).where(eq(channels.userId, userId)).orderBy(desc(channels.createdAt));
  }

  async updateChannel(id: number, channel: Partial<Channel>, userId?: number): Promise<Channel> {
    const [updatedChannel] = await db
      .update(channels)
      .set(channel)
      .where(userId ? and(eq(channels.id, id), eq(channels.userId, userId)) : eq(channels.id, id))
      .returning();
    return updatedChannel;
  }

  // Deletes a channel so it is no longer tracked
  async deleteChannel(id: number, userId: number): Promise<void> {
    await db.delete(channels).where(and(eq(channels.id, id), eq(channels.userId, userId)));
  }

  // Updates the "last checked" time to RIGHT NOW for a specific channel
  // This lets us know which videos are "new" next time we check
  async updateChannelLastChecked(id: number, userId?: number): Promise<void> {
    await db
      .update(channels)
      .set({ lastCheckedAt: new Date() }) // new Date() = current time
      .where(userId ? and(eq(channels.id, id), eq(channels.userId, userId)) : eq(channels.id, id));
  }
}

// This creates ONE instance of DatabaseStorage that the whole app shares
// Think of it like one shared filing cabinet everyone uses
export const storage = new DatabaseStorage();
