import { videos, type Video, type InsertVideo } from "@shared/schema";
import { db } from "./db";
import { eq, desc } from "drizzle-orm";

export interface IStorage {
  createVideo(video: InsertVideo): Promise<Video>;
  getVideos(): Promise<Video[]>;
  getVideo(id: number): Promise<Video | undefined>;
  deleteVideo(id: number): Promise<void>;
  updateVideo(id: number, video: Partial<Video>): Promise<Video>;
}

export class DatabaseStorage implements IStorage {
  async createVideo(insertVideo: InsertVideo): Promise<Video> {
    const [video] = await db.insert(videos).values(insertVideo).returning();
    return video;
  }

  async getVideos(): Promise<Video[]> {
    return await db.select().from(videos).orderBy(desc(videos.createdAt));
  }

  async getVideo(id: number): Promise<Video | undefined> {
    const [video] = await db.select().from(videos).where(eq(videos.id, id));
    return video;
  }

  async deleteVideo(id: number): Promise<void> {
    await db.delete(videos).where(eq(videos.id, id));
  }

  async updateVideo(id: number, video: Partial<Video>): Promise<Video> {
    const [updatedVideo] = await db.update(videos).set(video).where(eq(videos.id, id)).returning();
    return updatedVideo;
  }
}

export const storage = new DatabaseStorage();
