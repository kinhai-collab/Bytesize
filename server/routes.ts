import type { Express } from "express";
import { createServer, type Server } from "http";
import { registerAudioRoutes } from "./replit_integrations/audio";
import { storage } from "./storage";
import { currentUser, registerAuthRoutes, requireUser } from "./auth";
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
const NEVER_CHECKED = new Date(0);
const BROKEN_INITIAL_CHECK_CUTOFF = new Date("2026-06-08T00:00:00.000Z");

function buildSummaryPrompt(title: string, transcript: string) {
  return [
    "You are a ruthless video summarizer for busy people.",
    "",
    "Goal: explain the real point of the video in a summary that can be read aloud in under 1 minute.",
    "",
    "Rules:",
    "- Be short, specific, and direct: 90-130 words total.",
    "- Do not summarize the video's intro, hype, sponsor messages, or repeated setup.",
    "- If the title or speaker uses teaser language like \"you will not believe this\" or \"this can improve your health,\" identify what \"this\" actually is from the transcript.",
    "- Lead with the main takeaway, claim, recommendation, or conclusion.",
    "- Include only the 2-4 most important supporting points.",
    "- If the video gives advice, state the practical action the viewer should take.",
    "- If the transcript does not clearly support a claim, say that plainly instead of guessing.",
    "- No markdown headings, no bullet points, no timestamps, no filler.",
    "",
    "Output format:",
    "A single concise paragraph.",
    "",
    `Video title: ${title}`,
    "",
    "Transcript:",
    transcript.slice(0, 100000),
  ].join("\n");
}

type YouTubeChannelInfo = {
  channelId: string;
  channelName: string;
  channelThumbnailUrl: string | null;
};

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

async function getCachedVideoByYouTubeId(videoId: string, userId: number) {
  const videos = await storage.getVideos(userId);
  return videos.find((video) => {
    const cachedVideoId = extractYouTubeVideoId(video.url);
    return cachedVideoId === videoId && Boolean(video.summary);
  });
}

function formatYouTubeDuration(duration: string | undefined) {
  if (!duration) return null;

  const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return null;

  const hours = Number(match[1] || 0);
  const minutes = Number(match[2] || 0);
  const seconds = Number(match[3] || 0);
  const paddedSeconds = seconds.toString().padStart(2, "0");

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${paddedSeconds}`;
  }

  return `${minutes}:${paddedSeconds}`;
}

async function fetchVideoDetails(videoId: string) {
  if (!YOUTUBE_API_KEY) return null;

  const response = await fetch(
    `https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails&id=${videoId}&key=${YOUTUBE_API_KEY}`,
  );
  if (!response.ok) return null;

  const data = await response.json();
  const video = data.items?.[0];
  if (!video) return null;

  return {
    sourceChannelId: video.snippet?.channelId || null,
    sourceChannelName: video.snippet?.channelTitle || null,
    duration: formatYouTubeDuration(video.contentDetails?.duration),
  };
}

function isInitialChannelCheck(channel: { createdAt: Date | null; lastCheckedAt: Date | null }) {
  if (!channel.createdAt || !channel.lastCheckedAt) return true;
  return Math.abs(channel.createdAt.getTime() - channel.lastCheckedAt.getTime()) < 5000;
}

function extractYouTubeChannelId(channelUrl: string) {
  try {
    const urlObj = new URL(channelUrl);
    const parts = urlObj.pathname.split("/").filter(Boolean);
    if (parts[0] === "channel" && parts[1]?.startsWith("UC")) {
      return parts[1];
    }
  } catch (e) {}

  return channelUrl.startsWith("UC") ? channelUrl : "";
}

function extractYouTubeHandle(channelUrl: string) {
  const trimmed = channelUrl.trim();
  if (trimmed.startsWith("@")) return trimmed;

  try {
    const urlObj = new URL(trimmed);
    const handle = urlObj.pathname
      .split("/")
      .filter(Boolean)
      .find((part) => part.startsWith("@"));
    return handle || "";
  } catch (e) {}

  return "";
}

async function fetchYouTubeChannel(params: URLSearchParams): Promise<YouTubeChannelInfo | null> {
  const response = await fetch(
    `https://www.googleapis.com/youtube/v3/channels?${params.toString()}`,
  );
  if (!response.ok) return null;

  const data = await response.json();
  const channel = data.items?.[0];
  if (!channel?.id || !channel?.snippet?.title) return null;

  return {
    channelId: channel.id,
    channelName: channel.snippet.title,
    channelThumbnailUrl:
      channel.snippet.thumbnails?.medium?.url ||
      channel.snippet.thumbnails?.default?.url ||
      null,
  };
}

async function resolveYouTubeChannel(channelUrl: string): Promise<YouTubeChannelInfo | null> {
  const channelId = extractYouTubeChannelId(channelUrl);
  if (channelId) {
    const params = new URLSearchParams({
      part: "snippet",
      id: channelId,
      key: YOUTUBE_API_KEY || "",
    });
    const channel = await fetchYouTubeChannel(params);
    if (channel) return channel;
  }

  const handle = extractYouTubeHandle(channelUrl);
  if (handle) {
    const params = new URLSearchParams({
      part: "snippet",
      forHandle: handle,
      key: YOUTUBE_API_KEY || "",
    });
    const channel = await fetchYouTubeChannel(params);
    if (channel) return channel;
  }

  const searchRes = await fetch(
    `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(channelUrl)}&type=channel&key=${YOUTUBE_API_KEY}`,
  );
  const searchData = await searchRes.json();
  const channelInfo = searchData.items?.[0];
  if (!channelInfo?.id?.channelId || !channelInfo?.snippet?.channelTitle) {
    return null;
  }

  return {
    channelId: channelInfo.id.channelId,
    channelName: channelInfo.snippet.channelTitle,
    channelThumbnailUrl:
      channelInfo.snippet.thumbnails?.medium?.url ||
      channelInfo.snippet.thumbnails?.default?.url ||
      null,
  };
}

function shouldRecoverInitialBackfill(channel: { createdAt: Date | null }) {
  if (!channel.createdAt) return false;
  return channel.createdAt >= BROKEN_INITIAL_CHECK_CUTOFF;
}

async function updateFollowedChannel(channelId: number, userId: number) {
  const channels = await storage.getChannels(userId);
  let channel = channels.find((c) => c.id === channelId);

  if (!channel) {
    const notFound = new Error("Channel not found");
    (notFound as any).statusCode = 404;
    throw notFound;
  }

  const resolvedChannel = await resolveYouTubeChannel(channel.channelUrl);
  if (
    resolvedChannel &&
    (resolvedChannel.channelId !== channel.channelId ||
      resolvedChannel.channelName !== channel.channelName ||
      resolvedChannel.channelThumbnailUrl !== channel.channelThumbnailUrl)
  ) {
    channel = await storage.updateChannel(channelId, {
      channelId: resolvedChannel.channelId,
      channelName: resolvedChannel.channelName,
      channelThumbnailUrl: resolvedChannel.channelThumbnailUrl,
    }, userId);
  }

  const lastChecked = isInitialChannelCheck(channel)
    ? NEVER_CHECKED.toISOString()
    : channel.lastCheckedAt?.toISOString() || NEVER_CHECKED.toISOString();
  const videosRes = await fetch(
    `https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=${channel.channelId}&type=video&order=date&publishedAfter=${lastChecked}&maxResults=25&key=${YOUTUBE_API_KEY}`,
  );
  let videosData = await videosRes.json();
  let usedInitialBackfill = false;

  if (!videosData.items || videosData.items.length === 0) {
    if (shouldRecoverInitialBackfill(channel)) {
      const backfillRes = await fetch(
        `https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=${channel.channelId}&type=video&order=date&maxResults=25&key=${YOUTUBE_API_KEY}`,
      );
      videosData = await backfillRes.json();
      usedInitialBackfill = Boolean(videosData.items?.length);
    }

    if (!videosData.items || videosData.items.length === 0) {
      await storage.updateChannelLastChecked(channelId, userId);
      return {
        channelId,
        channelName: channel.channelName,
        message: "No new videos found",
        summarized: 0,
        reusedCached: 0,
        updatedCachedMetadata: 0,
        skippedNoTranscript: 0,
        skippedShortTranscript: 0,
        failed: 0,
        videos: [],
      };
    }
  }

  const summarized = [];
  let reusedCached = 0;
  let updatedCachedMetadata = 0;
  let skippedNoTranscript = 0;
  let skippedShortTranscript = 0;
  let failed = 0;

  for (const item of videosData.items) {
    const videoId = item.id.videoId;
    const videoTitle = item.snippet.title;
    const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;

    try {
      const videoDetails = await fetchVideoDetails(videoId);
      const sourceChannelId = videoDetails?.sourceChannelId || channel.channelId;
      const sourceChannelName = videoDetails?.sourceChannelName || channel.channelName;
      const duration = videoDetails?.duration || null;
      const cachedVideo = await getCachedVideoByYouTubeId(videoId, userId);

      if (cachedVideo) {
        reusedCached++;
        if (
          cachedVideo.sourceChannelId !== sourceChannelId ||
          cachedVideo.sourceChannelName !== sourceChannelName ||
          cachedVideo.duration !== duration
        ) {
          await storage.updateVideo(cachedVideo.id, {
            sourceChannelId,
            sourceChannelName,
            duration,
          }, userId);
          updatedCachedMetadata++;
        }
        continue;
      }

      const transcriptRes = await fetch(
        `https://youtube-transcripts.p.rapidapi.com/youtube/transcript?url=${encodeURIComponent(videoUrl)}`,
        {
          headers: {
            "x-rapidapi-key": RAPIDAPI_KEY!,
            "x-rapidapi-host": "youtube-transcripts.p.rapidapi.com",
          },
        },
      );

      if (!transcriptRes.ok) {
        skippedNoTranscript++;
        continue;
      }

      const transcriptData = await transcriptRes.json();
      let transcriptText = "";
      if (transcriptData.content && Array.isArray(transcriptData.content)) {
        transcriptText = transcriptData.content
          .map((i: any) => i.text || "")
          .join(" ");
      }

      if (!transcriptText || transcriptText.length < 50) {
        skippedShortTranscript++;
        continue;
      }

      const summaryRes = await anthropic.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 650,
        messages: [
          {
            role: "user",
            content: buildSummaryPrompt(videoTitle, transcriptText),
          },
        ],
      });

      const summary =
        summaryRes.content[0].type === "text"
          ? summaryRes.content[0].text
          : "No summary.";

      const savedVideo = await storage.createVideo({
        url: videoUrl,
        title: videoTitle,
        thumbnailUrl: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
        sourceChannelId,
        sourceChannelName,
        duration,
        transcript: transcriptText,
        summary,
      }, userId);

      summarized.push(savedVideo);
    } catch (e) {
      console.error(`Failed to process video ${videoId}:`, e);
      failed++;
    }
  }

  await storage.updateChannelLastChecked(channelId, userId);

  return {
    channelId,
    channelName: channel.channelName,
    message:
      summarized.length > 0 || reusedCached > 0
        ? `${usedInitialBackfill ? "Recovered initial channel backfill. " : ""}Successfully summarized ${summarized.length} new video(s)${reusedCached ? ` and reused ${reusedCached} cached summary/summaries` : ""}`
        : `Found ${videosData.items.length} recent video(s), but none could be summarized. ${skippedNoTranscript + skippedShortTranscript} had no usable transcript${failed ? ` and ${failed} failed while processing` : ""}.`,
    summarized: summarized.length,
    reusedCached,
    updatedCachedMetadata,
    skippedNoTranscript,
    skippedShortTranscript,
    failed,
    videos: summarized,
  };
}

export async function registerRoutes(
  httpServer: Server,
  app: Express,
): Promise<Server> {
  registerAuthRoutes(app);
  app.use("/api", requireUser);
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
    const user = currentUser(req);
    const videoList = await storage.getVideos(user.id);
    res.json(videoList);
  });

  app.get(api.videos.get.path, async (req, res) => {
    const user = currentUser(req);
    const video = await storage.getVideo(Number(req.params.id), user.id);
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

      const user = currentUser(req);
      const cachedVideo = await getCachedVideoByYouTubeId(videoId, user.id);
      if (cachedVideo) {
        return res.status(200).json(cachedVideo);
      }

      let title = `Video ${videoId}`;
      let sourceChannelName: string | null = null;
      try {
        const oembedRes = await fetch(`https://noembed.com/embed?url=${url}`);
        const oembedData = await oembedRes.json();
        if (oembedData.title) title = oembedData.title;
        if (oembedData.author_name) sourceChannelName = oembedData.author_name;
      } catch (e) {}
      const videoDetails = await fetchVideoDetails(videoId);

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
        const response = await anthropic.messages.create({
          model: "claude-sonnet-4-20250514",
          max_tokens: 650,
          messages: [{ role: "user", content: buildSummaryPrompt(title, transcriptText) }],
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
        sourceChannelId: videoDetails?.sourceChannelId || null,
        sourceChannelName: videoDetails?.sourceChannelName || sourceChannelName,
        duration: videoDetails?.duration || null,
        transcript: transcriptText,
        summary,
      }, user.id);
      res.status(201).json(video);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      res.status(500).json({ message: "Internal Server Error" });
    }
  });

  app.delete(api.videos.delete.path, async (req, res) => {
    const user = currentUser(req);
    await storage.deleteVideo(Number(req.params.id), user.id);
    res.status(204).send();
  });

  // ── CHANNEL ROUTES (these are all new) ──────────────────────────────────

  // GET /api/channels — returns the list of all saved channels
  app.get("/api/channels", async (req, res) => {
    try {
      const user = currentUser(req);
      const channelList = await storage.getChannels(user.id); // Fetch this user's channels
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

      const channelInfo = await resolveYouTubeChannel(channelUrl);

      // If YouTube found nothing, tell the user
      if (!channelInfo) {
        return res
          .status(404)
          .json({
            message: "Channel not found. Try pasting the full channel URL.",
          });
      }

      // Save the channel to our database
      const user = currentUser(req);
      const channel = await storage.createChannel({
        channelUrl,
        channelName: channelInfo.channelName,
        channelId: channelInfo.channelId,
        channelThumbnailUrl: channelInfo.channelThumbnailUrl,
        lastCheckedAt: NEVER_CHECKED, // First update should pull recent videos
      }, user.id);

      res.status(201).json(channel); // Send the saved channel back to the frontend
    } catch (err) {
      console.error("Add channel error:", err);
      res.status(500).json({ message: "Failed to add channel" });
    }
  });

  app.post("/api/channels/update-all", async (req, res) => {
    try {
      const user = currentUser(req);
      const channels = await storage.getChannels(user.id);
      const results = [];

      for (const channel of channels) {
        results.push(await updateFollowedChannel(channel.id, user.id));
      }

      const summarized = results.reduce((total, result) => total + result.summarized, 0);
      const reusedCached = results.reduce((total, result) => total + result.reusedCached, 0);
      const updatedCachedMetadata = results.reduce(
        (total, result) => total + result.updatedCachedMetadata,
        0,
      );

      res.json({
        message:
          summarized > 0
            ? `Found and summarized ${summarized} new video(s) across ${channels.length} channel(s).`
            : `Checked ${channels.length} channel(s). No new summaries were needed.`,
        summarized,
        reusedCached,
        updatedCachedMetadata,
        results,
      });
    } catch (err: any) {
      console.error("Update all channels error:", err);
      res.status(500).json({ message: err.message || "Failed to update channels" });
    }
  });

  // POST /api/channels/:id/update — checks for new videos and summarizes them
  // The ":id" part means the channel's ID number gets passed in the URL
  app.post("/api/channels/:id/update", async (req, res) => {
    try {
      const channelId = Number(req.params.id); // Get the channel ID from the URL
      const user = currentUser(req);
      const channels = await storage.getChannels(user.id);
      let channel = channels.find((c) => c.id === channelId); // Find this specific channel

      if (!channel)
        return res.status(404).json({ message: "Channel not found" });

      const resolvedChannel = await resolveYouTubeChannel(channel.channelUrl);
      if (
        resolvedChannel &&
        (resolvedChannel.channelId !== channel.channelId ||
          resolvedChannel.channelName !== channel.channelName ||
          resolvedChannel.channelThumbnailUrl !== channel.channelThumbnailUrl)
      ) {
        channel = await storage.updateChannel(channelId, {
          channelId: resolvedChannel.channelId,
          channelName: resolvedChannel.channelName,
          channelThumbnailUrl: resolvedChannel.channelThumbnailUrl,
        }, user.id);
      }

      // Ask YouTube for the most recent videos from this channel
      // "publishedAfter" means only get videos newer than when we last checked
      const lastChecked = isInitialChannelCheck(channel)
        ? NEVER_CHECKED.toISOString()
        : channel.lastCheckedAt?.toISOString() || NEVER_CHECKED.toISOString();
      const videosRes = await fetch(
        `https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=${channel.channelId}&type=video&order=date&publishedAfter=${lastChecked}&maxResults=25&key=${YOUTUBE_API_KEY}`,
      );
      let videosData = await videosRes.json();
      let usedInitialBackfill = false;

      if (!videosData.items || videosData.items.length === 0) {
        if (shouldRecoverInitialBackfill(channel)) {
          const backfillRes = await fetch(
            `https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=${channel.channelId}&type=video&order=date&maxResults=25&key=${YOUTUBE_API_KEY}`,
          );
          videosData = await backfillRes.json();
          usedInitialBackfill = Boolean(videosData.items?.length);
        }

        // If no new videos found, tell the user
        if (!videosData.items || videosData.items.length === 0) {
          await storage.updateChannelLastChecked(channelId, user.id); // Still update the timestamp
          return res.json({ message: "No new videos found", summarized: 0 });
        }
      }

      const summarized = []; // We'll collect all newly summarized videos here
      let reusedCached = 0;
      let updatedCachedMetadata = 0;
      let skippedNoTranscript = 0;
      let skippedShortTranscript = 0;
      let failed = 0;

      // Loop through each new video and summarize it
      for (const item of videosData.items) {
        const videoId = item.id.videoId; // YouTube video ID
        const videoTitle = item.snippet.title; // Video title
        const videoUrl = `https://www.youtube.com/watch?v=${videoId}`; // Full URL

        try {
          const videoDetails = await fetchVideoDetails(videoId);
          const sourceChannelId = videoDetails?.sourceChannelId || channel.channelId;
          const sourceChannelName = videoDetails?.sourceChannelName || channel.channelName;
          const duration = videoDetails?.duration || null;
          const cachedVideo = await getCachedVideoByYouTubeId(videoId, user.id);
          if (cachedVideo) {
            reusedCached++;
            if (
              cachedVideo.sourceChannelId !== sourceChannelId ||
              cachedVideo.sourceChannelName !== sourceChannelName ||
              cachedVideo.duration !== duration
            ) {
              await storage.updateVideo(cachedVideo.id, {
                sourceChannelId,
                sourceChannelName,
                duration,
              }, user.id);
              updatedCachedMetadata++;
            }
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

          if (!transcriptRes.ok) {
            skippedNoTranscript++;
            continue; // Skip this video if no transcript available
          }

          const transcriptData = await transcriptRes.json();
          let transcriptText = "";
          if (transcriptData.content && Array.isArray(transcriptData.content)) {
            transcriptText = transcriptData.content
              .map((i: any) => i.text || "")
              .join(" ");
          }

          if (!transcriptText || transcriptText.length < 50) {
            skippedShortTranscript++;
            continue; // Skip if transcript too short
          }

          // Generate AI summary using Claude (same as existing feature)
          const summaryRes = await anthropic.messages.create({
            model: "claude-sonnet-4-20250514",
            max_tokens: 650,
            messages: [
              {
                role: "user",
                content: buildSummaryPrompt(videoTitle, transcriptText),
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
            sourceChannelId,
            sourceChannelName,
            duration,
            transcript: transcriptText,
            summary,
          }, user.id);

          summarized.push(savedVideo); // Add to our results list
        } catch (e) {
          console.error(`Failed to process video ${videoId}:`, e);
          failed++;
          continue; // If one video fails, keep going with the others
        }
      }

      // Update the "last checked" time so next update only finds NEWER videos
      await storage.updateChannelLastChecked(channelId, user.id);

      // Tell the frontend how many videos were summarized
      res.json({
        message:
          summarized.length > 0 || reusedCached > 0
            ? `${usedInitialBackfill ? "Recovered initial channel backfill. " : ""}Successfully summarized ${summarized.length} new video(s)${reusedCached ? ` and reused ${reusedCached} cached summary/summaries` : ""}`
            : `Found ${videosData.items.length} recent video(s), but none could be summarized. ${skippedNoTranscript + skippedShortTranscript} had no usable transcript${failed ? ` and ${failed} failed while processing` : ""}.`,
        summarized: summarized.length,
        reusedCached,
        updatedCachedMetadata,
        skippedNoTranscript,
        skippedShortTranscript,
        failed,
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
      const user = currentUser(req);
      await storage.deleteChannel(channelId, user.id);
      res.status(204).send();
    } catch (err) {
      console.error("Delete channel error:", err);
      res.status(500).json({ message: "Failed to remove channel" });
    }
  });

  return httpServer;
}
