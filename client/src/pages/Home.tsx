import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import {
  Bookmark,
  CheckCircle2,
  Clock3,
  Headphones,
  Home as HomeIcon,
  LayoutGrid,
  Library,
  Loader2,
  LogOut,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Rss,
  Search,
  Sparkles,
  Trash2,
  UserCircle2,
  Volume2,
  X,
  Youtube,
} from "lucide-react";
import ReactPlayer from "react-player";
import { type Video } from "@shared/schema";
import { api } from "@shared/routes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth, useLogout } from "@/hooks/use-auth";
import { useCreateVideo, useDeleteVideo, useVideos } from "@/hooks/use-videos";
import { useSpeech } from "@/hooks/use-speech";
import { useToast } from "@/hooks/use-toast";

type Channel = {
  id: number;
  channelName: string;
  channelId: string;
  channelUrl?: string;
  channelThumbnailUrl?: string | null;
  lastCheckedAt?: string;
};

type View = "home" | "latest" | "channels" | "saved";

export default function Home() {
  const [summaryInput, setSummaryInput] = useState("");
  const [selectedVideo, setSelectedVideo] = useState<Video | null>(null);
  const [selectedChannel, setSelectedChannel] = useState<string>("all");
  const [activeView, setActiveView] = useState<View>("home");
  const [savedVideoIds, setSavedVideoIds] = useState<Set<number>>(() => {
    try {
      return new Set(JSON.parse(localStorage.getItem("bytesize-saved-videos") || "[]"));
    } catch {
      return new Set();
    }
  });
  const { data: videos = [], isLoading } = useVideos();
  const { mutate: createVideo, isPending: isCreating } = useCreateVideo();
  const { mutate: deleteVideo } = useDeleteVideo();
  const { data: auth } = useAuth();
  const logout = useLogout();
  const queryClient = useQueryClient();

  const { data: channels = [] } = useQuery<Channel[]>({
    queryKey: ["channels"],
    queryFn: async () => {
      const response = await fetch("/api/channels", { credentials: "include" });
      if (!response.ok) throw new Error("Failed to load channels");
      return response.json();
    },
  });

  const filteredVideos = useMemo(() => {
    let result = selectedChannel === "all" ? videos : videos.filter((video) => video.sourceChannelId === selectedChannel);
    if (activeView === "saved") result = result.filter((video) => savedVideoIds.has(video.id));
    return result;
  }, [activeView, savedVideoIds, selectedChannel, videos]);

  useEffect(() => {
    if (!selectedVideo && filteredVideos.length) setSelectedVideo(filteredVideos[0]);
    if (selectedVideo && !filteredVideos.some((video) => video.id === selectedVideo.id)) {
      setSelectedVideo(filteredVideos[0] || null);
    }
  }, [filteredVideos, selectedVideo]);

  const featured = filteredVideos[0];
  const trending = filteredVideos.slice(1, 5);
  const latest = filteredVideos.slice(1);

  const changeView = (view: View) => {
    setActiveView(view);
    if (view !== "saved") setSelectedChannel("all");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const toggleSaved = (videoId: number) => {
    setSavedVideoIds((current) => {
      const next = new Set(current);
      if (next.has(videoId)) next.delete(videoId);
      else next.add(videoId);
      localStorage.setItem("bytesize-saved-videos", JSON.stringify(Array.from(next)));
      return next;
    });
  };

  const refreshVideos = () => queryClient.invalidateQueries({ queryKey: [api.videos.list.path] });

  const submitSummary = (event: React.FormEvent) => {
    event.preventDefault();
    const url = summaryInput.trim();
    if (!url) return;
    createVideo({ url }, { onSuccess: () => setSummaryInput("") });
  };

  const removeVideo = (video: Video) => {
    if (!confirm(`Delete “${video.title}”?`)) return;
    deleteVideo(video.id, {
      onSuccess: () => {
        if (selectedVideo?.id === video.id) setSelectedVideo(null);
      },
    });
  };

  return (
    <div className="min-h-screen bg-[#09090e] text-[#f5f3fa]">
      <Header
        value={summaryInput}
        pending={isCreating}
        userName={auth?.user?.displayName || auth?.user?.email || "Account"}
        onChange={setSummaryInput}
        onSubmit={submitSummary}
        onLogout={() => logout.mutate()}
      />

      <div className="grid min-h-[calc(100vh-72px)] lg:grid-cols-[220px_minmax(0,1fr)]">
        <Sidebar
          channels={channels}
          selected={selectedChannel}
          activeView={activeView}
          savedCount={savedVideoIds.size}
          onSelect={(id) => { setSelectedChannel(id); setActiveView("home"); }}
          onViewChange={changeView}
        />

        <main className="min-w-0 px-4 py-6 sm:px-6 xl:px-8">
          {isLoading ? (
            <div className="flex min-h-[55vh] items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-violet-500" />
            </div>
          ) : activeView === "channels" ? (
            <ChannelsManager channels={channels} onVideosUpdated={refreshVideos} />
          ) : !featured ? (
            <EmptyState />
          ) : (
            <div className={`grid gap-6 ${selectedVideo ? "2xl:grid-cols-[minmax(0,1fr)_430px]" : ""}`}>
              <div className="min-w-0">
                {activeView === "home" && (
                  <section className="grid gap-5 xl:grid-cols-[minmax(0,1.55fr)_minmax(280px,.95fr)]">
                    <FeaturedCard video={featured} onSelect={() => setSelectedVideo(featured)} />
                    <TrendingList videos={trending} onSelect={setSelectedVideo} />
                  </section>
                )}

                <section className={activeView === "home" ? "mt-8" : "mt-1"}>
                  <div className="mb-4 flex items-end justify-between">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-violet-400">{activeView === "saved" ? "Your library" : "Your briefings"}</p>
                      <h2 className="mt-1 text-2xl font-semibold">{activeView === "saved" ? "Saved briefings" : "Latest summaries"}</h2>
                    </div>
                    <span className="text-sm text-[#8f8b9c]">{filteredVideos.length} briefings</span>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                    {(activeView === "home" ? latest : filteredVideos).map((video) => (
                      <EditorialCard
                        key={video.id}
                        video={video}
                        selected={selectedVideo?.id === video.id}
                        onSelect={() => setSelectedVideo(video)}
                        onDelete={() => removeVideo(video)}
                        isSaved={savedVideoIds.has(video.id)}
                        onToggleSaved={() => toggleSaved(video.id)}
                      />
                    ))}
                  </div>
                </section>
              </div>

              {selectedVideo && (
                <BriefingPanel
                  video={selectedVideo}
                  isSaved={savedVideoIds.has(selectedVideo.id)}
                  onToggleSaved={() => toggleSaved(selectedVideo.id)}
                  onClose={() => setSelectedVideo(null)}
                />
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

function Header({
  value,
  pending,
  userName,
  onChange,
  onSubmit,
  onLogout,
}: {
  value: string;
  pending: boolean;
  userName: string;
  onChange: (value: string) => void;
  onSubmit: (event: React.FormEvent) => void;
  onLogout: () => void;
}) {
  return (
    <header className="sticky top-0 z-50 flex h-[72px] items-center border-b border-white/10 bg-[#09090e]/95 px-4 backdrop-blur-xl sm:px-6">
      <div className="flex w-full items-center gap-4">
        <div className="flex w-[196px] shrink-0 items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 shadow-[0_0_28px_rgba(124,58,237,.28)]">
            <Sparkles className="h-5 w-5" />
          </span>
          <span className="font-display text-xl font-bold">Bytesize</span>
        </div>

        <form onSubmit={onSubmit} className="mx-auto flex max-w-3xl flex-1 items-center gap-2">
          <div className="relative min-w-0 flex-1">
            <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#777383]" />
            <Input
              value={value}
              onChange={(event) => onChange(event.target.value)}
              placeholder="Drop a link. Get the signal."
              disabled={pending}
              className="h-11 rounded-xl border-white/10 bg-[#111119] pl-10 text-[#f5f3fa] placeholder:text-[#777383] focus-visible:ring-violet-500"
            />
          </div>
          <Button type="submit" disabled={!value.trim() || pending} className="h-11 rounded-xl bg-violet-600 px-5 font-semibold text-white hover:bg-violet-500">
            {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
            Summarize
          </Button>
        </form>

        <div className="hidden w-[196px] items-center justify-end gap-2 lg:flex">
          <UserCircle2 className="h-5 w-5 text-violet-400" />
          <span className="max-w-[105px] truncate text-sm text-[#aaa6b5]">{userName}</span>
          <Button variant="ghost" size="icon" onClick={onLogout} aria-label="Sign out" className="text-[#8f8b9c] hover:bg-white/5 hover:text-white">
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </header>
  );
}

function Sidebar({
  channels,
  selected,
  activeView,
  savedCount,
  onSelect,
  onViewChange,
}: {
  channels: Channel[];
  selected: string;
  activeView: View;
  savedCount: number;
  onSelect: (id: string) => void;
  onViewChange: (view: View) => void;
}) {
  return (
    <aside className="hidden border-r border-white/10 bg-[#0c0c12] p-3 lg:block">
      <nav className="space-y-1">
        <NavItem icon={HomeIcon} label="Home" active={activeView === "home"} onClick={() => onViewChange("home")} />
        <NavItem icon={Clock3} label="Latest" active={activeView === "latest"} onClick={() => onViewChange("latest")} />
        <NavItem icon={LayoutGrid} label="Channels" active={activeView === "channels"} onClick={() => onViewChange("channels")} />
        <NavItem icon={Bookmark} label="Saved" badge={savedCount || undefined} active={activeView === "saved"} onClick={() => onViewChange("saved")} />
      </nav>
      <div className="my-5 h-px bg-white/10" />
      <p className="px-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#686473]">Channels</p>
      <div className="mt-2 space-y-1">
        <button onClick={() => onSelect("all")} className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition ${selected === "all" ? "bg-violet-500/15 text-violet-300" : "text-[#aaa6b5] hover:bg-white/5 hover:text-white"}`}>
          <Library className="h-4 w-4" /> All briefings
        </button>
        {channels.slice(0, 8).map((channel) => (
          <button key={channel.id} onClick={() => onSelect(channel.channelId)} className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm transition ${selected === channel.channelId ? "bg-violet-500/15 text-violet-300" : "text-[#aaa6b5] hover:bg-white/5 hover:text-white"}`}>
            <ChannelAvatar channel={channel} />
            <span className="truncate">{channel.channelName}</span>
          </button>
        ))}
      </div>
      <div className="mt-8 rounded-2xl border border-violet-500/20 bg-gradient-to-br from-violet-500/15 to-transparent p-4">
        <Sparkles className="h-5 w-5 text-violet-400" />
        <p className="mt-3 font-display text-sm font-semibold">Summaries that cut through.</p>
        <p className="mt-1 text-xs leading-5 text-[#8f8b9c]">Save time. Stay sharp.</p>
      </div>
    </aside>
  );
}

function NavItem({ icon: Icon, label, active = false, badge, onClick }: { icon: typeof HomeIcon; label: string; active?: boolean; badge?: number; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-current={active ? "page" : undefined} className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition ${active ? "bg-violet-500/15 text-violet-300" : "text-[#aaa6b5] hover:bg-white/5 hover:text-white"}`}>
      <Icon className="h-4 w-4" /> <span className="flex-1 text-left">{label}</span>
      {badge ? <span className="rounded-full bg-violet-500/20 px-2 py-0.5 text-[10px] font-semibold text-violet-300">{badge}</span> : null}
    </button>
  );
}

function FeaturedCard({ video, onSelect }: { video: Video; onSelect: () => void }) {
  return (
    <button onClick={onSelect} className="group relative min-h-[320px] overflow-hidden rounded-2xl border border-white/10 bg-[#14141c] text-left">
      <VideoImage video={video} className="absolute inset-0 h-full w-full object-cover transition duration-700 group-hover:scale-[1.03]" />
      <div className="absolute inset-0 bg-gradient-to-t from-black via-black/20 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 p-6">
        <span className="mb-3 inline-flex rounded-md bg-violet-600 px-2 py-1 text-[10px] font-bold uppercase tracking-[.16em]">Featured briefing</span>
        <h1 className="max-w-2xl text-2xl font-semibold leading-tight sm:text-3xl">{video.title}</h1>
        <p className="mt-2 line-clamp-2 max-w-2xl text-sm leading-6 text-white/75">{stripMarkdown(video.summary || "Your briefing is being prepared.")}</p>
        <VideoMeta video={video} className="mt-4 text-white/70" />
      </div>
    </button>
  );
}

function TrendingList({ videos, onSelect }: { videos: Video[]; onSelect: (video: Video) => void }) {
  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-display text-lg font-semibold">Trending summaries</h2>
        <span className="text-xs text-violet-400">Fresh signal</span>
      </div>
      <div className="space-y-2.5">
        {videos.map((video) => (
          <button key={video.id} onClick={() => onSelect(video)} className="group flex w-full gap-3 rounded-xl border border-white/10 bg-[#111118] p-2 text-left transition hover:border-violet-500/50 hover:bg-[#16151f]">
            <div className="relative h-[76px] w-[124px] shrink-0 overflow-hidden rounded-lg">
              <VideoImage video={video} className="h-full w-full object-cover transition group-hover:scale-105" />
              <DurationBadge video={video} />
            </div>
            <div className="min-w-0 py-1">
              <h3 className="line-clamp-2 text-sm font-semibold leading-5">{video.title}</h3>
              <p className="mt-2 text-xs text-[#777383]">{readingTime(video.summary)} min briefing</p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

function EditorialCard({ video, selected, isSaved, onSelect, onDelete, onToggleSaved }: { video: Video; selected: boolean; isSaved: boolean; onSelect: () => void; onDelete: () => void; onToggleSaved: () => void }) {
  return (
    <article className={`group relative overflow-hidden rounded-2xl border bg-[#111118] transition ${selected ? "border-violet-500/70 shadow-[0_0_0_1px_rgba(139,92,246,.2)]" : "border-white/10 hover:-translate-y-0.5 hover:border-violet-500/40"}`}>
      <button onClick={onSelect} className="block w-full text-left">
        <div className="relative aspect-video overflow-hidden">
          <VideoImage video={video} className="h-full w-full object-cover transition duration-500 group-hover:scale-105" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
          <DurationBadge video={video} />
          {video.processed && <span className="absolute left-2.5 top-2.5 rounded-md bg-violet-600 px-2 py-1 text-[10px] font-semibold">Ready</span>}
        </div>
        <div className="p-4">
          <h3 className="line-clamp-2 min-h-11 font-display text-base font-semibold leading-[1.35]">{video.title}</h3>
          <VideoMeta video={video} className="mt-3 text-[#8f8b9c]" />
        </div>
      </button>
      <button onClick={onDelete} aria-label="Delete summary" className="absolute right-2 top-2 rounded-lg bg-black/70 p-2 text-white/70 opacity-0 transition hover:text-red-400 group-hover:opacity-100">
        <Trash2 className="h-4 w-4" />
      </button>
      <button onClick={onToggleSaved} aria-label={isSaved ? "Remove from saved" : "Save briefing"} className={`absolute right-11 top-2 rounded-lg bg-black/70 p-2 transition ${isSaved ? "text-violet-300 opacity-100" : "text-white/70 opacity-0 hover:text-violet-300 group-hover:opacity-100"}`}>
        <Bookmark className={`h-4 w-4 ${isSaved ? "fill-current" : ""}`} />
      </button>
    </article>
  );
}

function ChannelsManager({ channels, onVideosUpdated }: { channels: Channel[]; onVideosUpdated: () => void }) {
  const [channelInput, setChannelInput] = useState("");
  const [updatingId, setUpdatingId] = useState<number | "all" | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const refreshData = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["channels"] }),
      queryClient.invalidateQueries({ queryKey: [api.videos.list.path] }),
    ]);
    onVideosUpdated();
  };

  const updateChannels = async (channel?: Channel) => {
    setUpdatingId(channel?.id ?? "all");
    try {
      const response = await fetch(channel ? `/api/channels/${channel.id}/update` : "/api/channels/update-all", {
        method: "POST",
        credentials: "include",
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.message || "Unable to update channels");
      await refreshData();
      toast({
        title: result?.summarized ? `${result.summarized} new summaries` : "You're up to date",
        description: result?.message || "The latest channel videos have been checked.",
      });
    } catch (error) {
      toast({ title: "Channel update failed", description: error instanceof Error ? error.message : "Please try again.", variant: "destructive" });
    } finally {
      setUpdatingId(null);
    }
  };

  const addChannel = async (event: React.FormEvent) => {
    event.preventDefault();
    const channelUrl = channelInput.trim();
    if (!channelUrl) return;
    setIsAdding(true);
    try {
      const response = await fetch("/api/channels", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channelUrl }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.message || "Unable to add channel");
      setChannelInput("");
      await queryClient.invalidateQueries({ queryKey: ["channels"] });
      toast({ title: "Channel added", description: `${result.channelName} is ready to update.` });
    } catch (error) {
      toast({ title: "Couldn't add channel", description: error instanceof Error ? error.message : "Please check the URL.", variant: "destructive" });
    } finally {
      setIsAdding(false);
    }
  };

  return (
    <section className="mx-auto max-w-5xl">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-violet-400">Sources</p>
          <h1 className="mt-1 text-3xl font-semibold">Followed channels</h1>
          <p className="mt-2 text-sm text-[#8f8b9c]">Pull new uploads and turn them into briefings.</p>
        </div>
        <Button type="button" onClick={() => updateChannels()} disabled={!channels.length || updatingId !== null} className="rounded-xl bg-violet-600 text-white hover:bg-violet-500">
          {updatingId === "all" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
          Update all channels
        </Button>
      </div>

      <form onSubmit={addChannel} className="mt-7 flex gap-2 rounded-2xl border border-white/10 bg-[#111118] p-3">
        <div className="relative min-w-0 flex-1">
          <Rss className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#777383]" />
          <Input value={channelInput} onChange={(event) => setChannelInput(event.target.value)} placeholder="Paste a YouTube channel URL" className="h-11 border-white/10 bg-[#0c0c12] pl-10 text-white placeholder:text-[#666270]" />
        </div>
        <Button type="submit" disabled={!channelInput.trim() || isAdding} className="h-11 rounded-xl bg-white px-5 font-semibold text-black hover:bg-white/90">
          {isAdding ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />} Add channel
        </Button>
      </form>

      <div className="mt-5 grid gap-3 md:grid-cols-2">
        {channels.map((channel) => (
          <article key={channel.id} className="flex items-center gap-4 rounded-2xl border border-white/10 bg-[#111118] p-4">
            <span className="scale-150"><ChannelAvatar channel={channel} /></span>
            <div className="min-w-0 flex-1 pl-2">
              <h2 className="truncate font-display font-semibold">{channel.channelName}</h2>
              <p className="mt-1 text-xs text-[#777383]">{channel.lastCheckedAt ? `Checked ${formatDistanceToNow(new Date(channel.lastCheckedAt), { addSuffix: true })}` : "Not checked yet"}</p>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={() => updateChannels(channel)} disabled={updatingId !== null} className="rounded-xl border-white/10 bg-transparent text-white hover:bg-white/5 hover:text-white">
              {updatingId === channel.id ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-2 h-3.5 w-3.5" />} Update
            </Button>
          </article>
        ))}
      </div>

      {!channels.length && <div className="mt-5 rounded-2xl border border-dashed border-white/15 py-14 text-center text-sm text-[#8f8b9c]">Add a channel above to automatically pull its newest videos.</div>}
    </section>
  );
}

function BriefingPanel({ video, isSaved, onToggleSaved, onClose }: { video: Video; isSaved: boolean; onToggleSaved: () => void; onClose: () => void }) {
  const [showVideo, setShowVideo] = useState(false);
  const { toast } = useToast();
  const { isPreparing, isSpeaking, speak, stop } = useSpeech({
    onError: (message) => toast({ title: message, variant: "destructive" }),
  });

  useEffect(() => {
    stop();
    setShowVideo(false);
  }, [video.id, stop]);

  const toggleBriefing = () => {
    if (isSpeaking || isPreparing) stop();
    else if (video.summary) speak(video.summary);
  };

  return (
    <aside className="h-fit rounded-2xl border border-white/10 bg-[#111118] 2xl:sticky 2xl:top-[96px] 2xl:max-h-[calc(100vh-112px)] 2xl:overflow-y-auto 2xl:overscroll-contain">
      <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[.18em] text-violet-400">Selected briefing</p>
          <p className="mt-1 text-xs text-[#777383]">{readingTime(video.summary)} minute read</p>
        </div>
        <button onClick={onClose} aria-label="Close briefing" className="rounded-lg p-2 text-[#777383] hover:bg-white/5 hover:text-white"><X className="h-4 w-4" /></button>
      </div>

      <div className="p-4">
        <div className="relative aspect-video overflow-hidden rounded-xl bg-black">
          {showVideo ? (
            <ReactPlayer src={video.url} controls playing width="100%" height="100%" />
          ) : (
            <>
              <VideoImage video={video} className="h-full w-full object-cover" />
              <div className="absolute inset-0 flex items-center justify-center bg-black/25">
                <button onClick={() => setShowVideo(true)} className="flex h-16 w-16 items-center justify-center rounded-full border border-white/20 bg-black/60 text-white backdrop-blur transition hover:scale-105 hover:bg-violet-600">
                  <Play className="ml-1 h-7 w-7 fill-current" />
                </button>
              </div>
              <span className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-black/70 px-3 py-1 text-[11px] font-medium text-white/85">Watch video</span>
            </>
          )}
        </div>

        <div className="mt-4 flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-xl font-semibold leading-tight">{video.title}</h2>
            <VideoMeta video={video} className="mt-2 text-[#8f8b9c]" />
          </div>
          <button onClick={onToggleSaved} aria-label={isSaved ? "Remove from saved" : "Save briefing"} className={`rounded-lg border p-2 hover:border-violet-500/50 hover:text-violet-300 ${isSaved ? "border-violet-500/40 bg-violet-500/10 text-violet-300" : "border-white/10 text-[#8f8b9c]"}`}><Bookmark className={`h-4 w-4 ${isSaved ? "fill-current" : ""}`} /></button>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-2.5">
          <Button onClick={toggleBriefing} disabled={!video.summary} className="h-auto min-h-12 rounded-xl bg-violet-600 px-3 py-2.5 font-semibold text-white hover:bg-violet-500">
            {isPreparing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : isSpeaking ? <Pause className="mr-2 h-4 w-4 fill-current" /> : <Headphones className="mr-2 h-4 w-4" />}
            <span className="text-left leading-tight">{isSpeaking ? "Pause briefing" : `Listen · ${readingTime(video.summary)} min`}</span>
          </Button>
          <Button onClick={() => setShowVideo(true)} variant="outline" className="min-h-12 rounded-xl border-white/15 bg-transparent text-white hover:bg-white/5 hover:text-white">
            <Play className="mr-2 h-4 w-4 fill-current" /> Watch video
          </Button>
        </div>

        {(isSpeaking || isPreparing) && (
          <div className="mt-3 flex items-center gap-3 rounded-xl border border-violet-500/25 bg-violet-500/10 px-3 py-3">
            <button onClick={toggleBriefing} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-violet-600 text-white">
              {isPreparing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Pause className="h-4 w-4 fill-current" />}
            </button>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between text-xs"><span className="font-semibold">{isPreparing ? "Preparing narration" : "Playing briefing"}</span><span className="text-violet-300">1×</span></div>
              <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/10"><div className="h-full w-1/3 animate-pulse rounded-full bg-violet-500" /></div>
            </div>
            <Volume2 className="h-4 w-4 text-violet-300" />
          </div>
        )}

        <Tabs defaultValue="summary" className="mt-5">
          <TabsList className="grid w-full grid-cols-2 border-b border-white/10 bg-transparent p-0">
            <TabsTrigger value="summary" className="rounded-none border-b-2 border-transparent pb-3 text-[#8f8b9c] data-[state=active]:border-violet-500 data-[state=active]:bg-transparent data-[state=active]:text-violet-300">Summary</TabsTrigger>
            <TabsTrigger value="transcript" className="rounded-none border-b-2 border-transparent pb-3 text-[#8f8b9c] data-[state=active]:border-violet-500 data-[state=active]:bg-transparent data-[state=active]:text-violet-300">Transcript</TabsTrigger>
          </TabsList>
          <TabsContent value="summary" className="max-h-[360px] overflow-y-auto pt-4"><BriefingText text={video.summary || "Summary is still being prepared."} /></TabsContent>
          <TabsContent value="transcript" className="max-h-[360px] overflow-y-auto pt-4"><p className="whitespace-pre-wrap text-sm leading-7 text-[#aaa6b5]">{video.transcript || "Transcript unavailable."}</p></TabsContent>
        </Tabs>
      </div>
    </aside>
  );
}

function BriefingText({ text }: { text: string }) {
  const paragraphs = text.split(/\n+/).map((item) => stripMarkdown(item)).filter(Boolean);
  return <div className="space-y-3">{paragraphs.map((paragraph, index) => <p key={index} className="text-sm leading-7 text-[#b8b4c2]">{paragraph}</p>)}</div>;
}

function VideoImage({ video, className }: { video: Video; className: string }) {
  return video.thumbnailUrl ? <img src={video.thumbnailUrl} alt={video.title} className={className} /> : <div className={`${className} flex items-center justify-center bg-[#1a1922]`}><Youtube className="h-10 w-10 text-[#4f4b5a]" /></div>;
}

function DurationBadge({ video }: { video: Video }) {
  return <span className="absolute bottom-2 right-2 rounded-md bg-black/80 px-1.5 py-0.5 text-[10px] font-semibold text-white">{video.duration || "--:--"}</span>;
}

function VideoMeta({ video, className }: { video: Video; className?: string }) {
  return <p className={`flex items-center gap-2 text-xs ${className || ""}`}><span className="truncate">{video.sourceChannelName || "YouTube"}</span><span>•</span><span className="shrink-0">{video.createdAt ? formatDistanceToNow(new Date(video.createdAt), { addSuffix: true }) : "recently"}</span>{video.processed && <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-violet-400" />}</p>;
}

function ChannelAvatar({ channel }: { channel: Channel }) {
  return channel.channelThumbnailUrl ? <img src={channel.channelThumbnailUrl} alt="" className="h-6 w-6 shrink-0 rounded-full object-cover" /> : <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-violet-500/15 text-[10px] font-bold text-violet-300">{channel.channelName.charAt(0)}</span>;
}

function EmptyState() {
  return <div className="mx-auto mt-20 max-w-lg rounded-3xl border border-dashed border-white/15 bg-[#111118] px-8 py-16 text-center"><Sparkles className="mx-auto h-9 w-9 text-violet-400" /><h1 className="mt-4 text-2xl font-semibold">Your briefing desk is ready</h1><p className="mt-2 text-sm leading-6 text-[#8f8b9c]">Paste a YouTube URL above to turn a long video into a concise briefing you can read or listen to.</p></div>;
}

function stripMarkdown(value: string) {
  return value.replace(/[#*_>`~-]/g, "").replace(/\s+/g, " ").trim();
}

function readingTime(value?: string | null) {
  return Math.max(1, Math.round((stripMarkdown(value || "").split(/\s+/).filter(Boolean).length || 1) / 180));
}
