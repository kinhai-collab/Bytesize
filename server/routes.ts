import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";
import { YoutubeTranscript } from 'youtube-transcript';
import Anthropic from "@anthropic-ai/sdk";
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  
  app.get(api.videos.list.path, async (req, res) => {
    const videos = await storage.getVideos();
    res.json(videos);
  });

  app.get(api.videos.get.path, async (req, res) => {
    const video = await storage.getVideo(Number(req.params.id));
    if (!video) return res.status(404).json({ message: "Video not found" });
    res.json(video);
  });

  app.post(api.videos.create.path, async (req, res) => {
    try {
      const { url } = api.videos.create.input.parse(req.body);

      // 1. Extract Video ID
      let videoId = "";
      try {
        const urlObj = new URL(url);
        if (urlObj.hostname.includes("youtube.com")) {
          videoId = urlObj.searchParams.get("v") || "";
        } else if (urlObj.hostname.includes("youtu.be")) {
          videoId = urlObj.pathname.slice(1);
        }
      } catch (e) {
        return res.status(400).json({ message: "Invalid URL" });
      }

      if (!videoId) {
        return res.status(400).json({ message: "Could not extract video ID" });
      }

      // 2. Fetch Title (optional but nice)
      let title = `Video ${videoId}`;
      try {
        const oembedRes = await fetch(`https://noembed.com/embed?url=${url}`);
        const oembedData = await oembedRes.json();
        if (oembedData.title) title = oembedData.title;
      } catch (e) {
        console.log("Failed to fetch title via noembed", e);
      }

      // 3. Fetch Transcript
      let transcriptText = "";
      try {
        const transcript = await YoutubeTranscript.fetchTranscript(videoId);
        transcriptText = transcript.map(t => t.text).join(" ");
      } catch (e) {
        return res.status(400).json({ message: "Failed to fetch transcript. Video might not have captions or is unavailable." });
      }

      // 4. Summarize
      let summary = "";
      try {
   const response = await anthropic.messages.create({
  model: "claude-sonnet-4-20250514",
  max_tokens: 2048,
  messages: [
    { 
      role: "user", 
      content: `You are an expert video summarizer. Summarize the following video transcript efficiently. Focus on key points and takeaways. Format with Markdown.

Transcript:
${transcriptText.slice(0, 100000)}`
    }
  ],
});
summary = response.content[0].type === 'text' ? response.content[0].text : "No summary generated.";
      } catch (e) {
        console.error("OpenAI Error:", e);
        return res.status(500).json({ message: "Failed to generate summary" });
      }

      const video = await storage.createVideo({
        url,
        title,
        thumbnailUrl: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
        transcript: transcriptText,
        summary,
        processed: true
      });

      res.status(201).json(video);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join('.'),
        });
      }
      console.error(err);
      res.status(500).json({ message: "Internal Server Error" });
    }
  });

  app.delete(api.videos.delete.path, async (req, res) => {
    await storage.deleteVideo(Number(req.params.id));
    res.status(204).send();
  });

  return httpServer;
}
