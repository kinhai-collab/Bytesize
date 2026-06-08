import type { Express } from "express";
import { createServer, type Server } from "http";
import { registerAudioRoutes } from "./replit_integrations/audio";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;
const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY; // Our new YouTube Data API key

function extractYouTubeVideoId(url: string): string {
  try {
    const urlObj = new URL(url);
    if (urlObj.hostname.includes("youtube.com")) {
      if (urlObj.pathname.startsWith("/shorts/")) {
        return urlObj.pathname.split("/")[2] || "";
      }
      return urlObj.searchParams.get("v") || "";
    }
    if (urlObj.hostname.includes("youtu.be")) {
      return urlObj.pathname.split("/").filter(Boolean)[0] || "";
    }
  } catch (e) {}

  return "";
}

async function getCachedVideoByYouTubeId(videoId: string) {
  const videos = await storage.getVideos();
  return videos.find((video) => {
    const cachedVideoId = extractYouTubeVideoId(video.url);
    return cachedVideoId === videoId && Boolean(video.summary);
  });
}

export async function registerRoutes(
  httpServer: Server,
  app: Express,
): Promise<Server> {
  registerAudioRoutes(app);

  app.post("/api/tts", async (req, res) => {
    try {
      const { text } = req.body;
      if (!text) return res.status(400).json({ message: "Text is required" });

      const response = await openai.chat.completions.create({
        model: "gpt-audio",
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: `Read this summary aloud: ${text}` },
            ],
          },
        ],
        modalities: ["text", "audio"],
        audio: { voice: "alloy", format: "mp3" },
      });

      const base64Audio = response.choices[0].message.audio?.data;
      if (!base64Audio) throw new Error("No audio data returned");

      const audioUrl = `data:audio/mpeg;base64,${base64Audio}`;
      res.json({ audioUrl });
    } catch (error) {
      console.error("TTS error:", error);
      res.status(500).json({ message: "Failed to generate speech" });
    }
  });

  app.get(api.videos.list.path, async (req, res) => {
    const videos = await storage.getVideos();
    res.json(videos);
  });

  app.get(api.videos.get.path, async (req, res) => {
    const video = await storage.getVideo(Number(req.params.id));
    if (!video) return res.status(404).json({ message: "Video not found" });
    res.json(video);
  });

  app.get("/api/test-transcript", async (req, res) => {
    const testUrl = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";
    try {
      const apiUrl = `https://youtube-transcripts.p.rapidapi.com/youtube/transcript?url=${encodeURIComponent(testUrl)}`;
      const response = await fetch(apiUrl, {
        method: "GET",
        headers: {
          "x-rapidapi-key": RAPIDAPI_KEY!,
          "x-rapidapi-host": "youtube-transcripts.p.rapidapi.com",
        },
      });
      if (!response.ok) throw new Error(`API error: ${response.status}`);
      const data = await response.json();
      let transcriptText = "";
      if (data.content && Array.isArray(data.content)) {
        transcriptText = data.content
          .map((item: any) => item.text || "")
          .join(" ");
      }
      res.json({
        success: true,
        transcriptLength: transcriptText.length,
        preview: transcriptText.slice(0, 200),
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post(api.videos.create.path, async (req, res) => {
    try {
      const { url } = api.videos.create.input.parse(req.body);
      const videoId = extractYouTubeVideoId(url);
      if (!videoId) {
        return res.status(400).json({ message: "Invalid YouTube URL" });
      }

      const cachedVideo = await getCachedVideoByYouTubeId(videoId);
      if (cachedVideo) {
        return res.status(200).json(cachedVideo);
      }

      let title = `Video ${videoId}`;
      try {
        const oembedRes = await fetch(`https://noembed.com/embed?url=${url}`);
        const oembedData = await oembedRes.json();
        if (oembedData.title) title = oembedData.title;
      } catch (e) {}

      let transcriptText = "";
      try {
        const apiUrl = `https://youtube-transcripts.p.rapidapi.com/youtube/transcript?url=${encodeURIComponent(url)}`;
        const response = await fetch(apiUrl, {
          method: "GET",
          headers: {
            "x-rapidapi-key": RAPIDAPI_KEY!,
            "x-rapidapi-host": "youtube-transcripts.p.rapidapi.com",
          },
        });
        if (!response.ok)
          return res
            .status(400)
            .json({ message: "This video doesn't have captions available." });
        const data = await response.json();
        if (data.content && Array.isArray(data.content)) {
          transcriptText = data.content
            .map((item: any) => item.text || "")
            .join(" ");
        } else if (typeof data.content === "string") {
          transcriptText = data.content;
        }
      } catch (e: any) {
        return res.status(400).json({ message: "Could not fetch transcript." });
      }

      if (!transcriptText || transcriptText.length < 50) {
        return res
          .status(400)
          .json({ message: "No captions available for this video." });
      }

      let summary = "";
      try {
        const prompt =
          "You are an expert video summarizer. Write a detailed summary.\n\nVideo: " +
          title +
          "\n\nTranscript:\n" +
          transcriptText.slice(0, 100000);
        const response = await anthropic.messages.create({
          model: "claude-sonnet-4-20250514",
          max_tokens: 2048,
          messages: [{ role: "user", content: prompt }],
        });
        summary =
          response.content[0].type === "text"
            ? response.content[0].text
            : "No summary.";
      } catch (e) {
        return res.status(500).json({ message: "Failed to generate summary." });
      }

      const video = await storage.createVideo({
        url,
        title,
        thumbnailUrl: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
        transcript: transcriptText,
        summary,
      });
      res.status(201).json(video);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      res.status(500).json({ message: "Internal Server Error" });
    }
  });

  app.delete(api.videos.delete.path, async (req, res) => {
    await storage.deleteVideo(Number(req.params.id));
    res.status(204).send();
  });

  // ── CHANNEL ROUTES (these are all new) ──────────────────────────────────

  // GET /api/channels — returns the list of all saved channels
  app.get("/api/channels", async (req, res) => {
    try {
      const channelList = await storage.getChannels(); // Fetch all channels from database
      res.json(channelList);
    } catch (err) {
      res.status(500).json({ message: "Could not load channels" });
    }
  });

  // POST /api/channels — saves a new channel from a YouTube channel URL
  app.post("/api/channels", async (req, res) => {
    try {
      const { channelUrl } = req.body; // Get the URL the user pasted
      if (!channelUrl)
        return res.status(400).json({ message: "Channel URL is required" });

      // Ask YouTube's API for info about this channel URL
      // We use the "search" endpoint to find the channel by its URL
      const searchRes = await fetch(
        `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(channelUrl)}&type=channel&key=${YOUTUBE_API_KEY}`,
      );
      const searchData = await searchRes.json();

      // If YouTube found nothing, tell the user
      if (!searchData.items || searchData.items.length === 0) {
        return res
          .status(404)
          .json({
            message: "Channel not found. Try pasting the full channel URL.",
          });
      }

      // Grab the first result's info
      const channelInfo = searchData.items[0];
      const channelId = channelInfo.id.channelId; // YouTube's internal channel ID
      const channelName = channelInfo.snippet.channelTitle; // The channel's display name

      // Save the channel to our database
      const channel = await storage.createChannel({
        channelUrl,
        channelName,
        channelId,
        lastCheckedAt: new Date(), // Set "last checked" to right now
      });

      res.status(201).json(channel); // Send the saved channel back to the frontend
    } catch (err) {
      console.error("Add channel error:", err);
      res.status(500).json({ message: "Failed to add channel" });
    }
  });

  // POST /api/channels/:id/update — checks for new videos and summarizes them
  // The ":id" part means the channel's ID number gets passed in the URL
  app.post("/api/channels/:id/update", async (req, res) => {
    try {
      const channelId = Number(req.params.id); // Get the channel ID from the URL
      const channels = await storage.getChannels();
      const channel = channels.find((c) => c.id === channelId); // Find this specific channel

      if (!channel)
        return res.status(404).json({ message: "Channel not found" });

      // Ask YouTube for the most recent videos from this channel
      // "publishedAfter" means only get videos newer than when we last checked
      const lastChecked =
        channel.lastCheckedAt?.toISOString() || new Date(0).toISOString();
      const videosRes = await fetch(
        `https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=${channel.channelId}&type=video&order=date&publishedAfter=${lastChecked}&maxResults=10&key=${YOUTUBE_API_KEY}`,
      );
      const videosData = await videosRes.json();

      // If no new videos found, tell the user
      if (!videosData.items || videosData.items.length === 0) {
        await storage.updateChannelLastChecked(channelId); // Still update the timestamp
        return res.json({ message: "No new videos found", summarized: 0 });
      }

      const summarized = []; // We'll collect all newly summarized videos here
      let reusedCached = 0;

      // Loop through each new video and summarize it
      for (const item of videosData.items) {
        const videoId = item.id.videoId; // YouTube video ID
        const videoTitle = item.snippet.title; // Video title
        const videoUrl = `https://www.youtube.com/watch?v=${videoId}`; // Full URL

        try {
          const cachedVideo = await getCachedVideoByYouTubeId(videoId);
          if (cachedVideo) {
            reusedCached++;
            continue;
          }

          // Fetch the transcript for this video (same as existing summarize feature)
          const transcriptRes = await fetch(
            `https://youtube-transcripts.p.rapidapi.com/youtube/transcript?url=${encodeURIComponent(videoUrl)}`,
            {
              headers: {
                "x-rapidapi-key": RAPIDAPI_KEY!,
                "x-rapidapi-host": "youtube-transcripts.p.rapidapi.com",
              },
            },
          );

          if (!transcriptRes.ok) continue; // Skip this video if no transcript available

          const transcriptData = await transcriptRes.json();
          let transcriptText = "";
          if (transcriptData.content && Array.isArray(transcriptData.content)) {
            transcriptText = transcriptData.content
              .map((i: any) => i.text || "")
              .join(" ");
          }

          if (!transcriptText || transcriptText.length < 50) continue; // Skip if transcript too short

          // Generate AI summary using Claude (same as existing feature)
          const summaryRes = await anthropic.messages.create({
            model: "claude-sonnet-4-20250514",
            max_tokens: 2048,
            messages: [
              {
                role: "user",
                content: `You are an expert video summarizer. Write a detailed summary.\n\nVideo: ${videoTitle}\n\nTranscript:\n${transcriptText.slice(0, 100000)}`,
              },
            ],
          });

          const summary =
            summaryRes.content[0].type === "text"
              ? summaryRes.content[0].text
              : "No summary.";

          // Save this video + summary to the database
          const savedVideo = await storage.createVideo({
            url: videoUrl,
            title: videoTitle,
            thumbnailUrl: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
            transcript: transcriptText,
            summary,
          });

          summarized.push(savedVideo); // Add to our results list
        } catch (e) {
          console.error(`Failed to process video ${videoId}:`, e);
          continue; // If one video fails, keep going with the others
        }
      }

      // Update the "last checked" time so next update only finds NEWER videos
      await storage.updateChannelLastChecked(channelId);

      // Tell the frontend how many videos were summarized
      res.json({
        message: `Successfully summarized ${summarized.length} new video(s)${reusedCached ? ` and reused ${reusedCached} cached summary/summaries` : ""}`,
        summarized: summarized.length,
        reusedCached,
        videos: summarized,
      });
    } catch (err) {
      console.error("Update channel error:", err);
      res.status(500).json({ message: "Failed to update channel" });
    }
  });

  // DELETE /api/channels/:id — stops tracking a followed channel
  app.delete("/api/channels/:id", async (req, res) => {
    try {
      const channelId = Number(req.params.id);
      await storage.deleteChannel(channelId);
      res.status(204).send();
    } catch (err) {
      console.error("Delete channel error:", err);
      res.status(500).json({ message: "Failed to remove channel" });
    }
  });

  return httpServer;
}
