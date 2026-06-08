import { useMemo, useState } from "react";
import { Link } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import {
  CheckCircle2,
  Grid3X3,
  Loader2,
  PanelRightClose,
  PanelRightOpen,
  Plus,
  RefreshCw,
  Sparkles,
  Trash2,
  Youtube,
} from "lucide-react";
import { type Video } from "@shared/schema";
import { api } from "@shared/routes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useCreateVideo, useVideos } from "@/hooks/use-videos";

type Channel = {
  id: number;
  channelUrl: string;
  channelName: string;
  channelId: string;
  channelThumbnailUrl?: string | null;
  lastCheckedAt: string;
  createdAt: string;
};

export default function Home() {
  const [summaryInput, setSummaryInput] = useState("");
  const [channelInput, setChannelInput] = useState("");
  const [showAddChannel, setShowAddChannel] = useState(false);
  const [selectedChannelId, setSelectedChannelId] = useState<number | "all">("all");
  const [rightPanelOpen, setRightPanelOpen] = useState(true);
  const [updatingId, setUpdatingId] = useState<number | null>(null);
  const [removingId, setRemovingId] = useState<number | null>(null);

  const { data: videos = [], isLoading: videosLoading } = useVideos();
  const { mutate: createVideo, isPending: isCreatingVideo } = useCreateVideo();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: channels = [], isLoading: channelsLoading } = useQuery<Channel[]>({
    queryKey: ["channels"],
    queryFn: async () => {
      const res = await fetch("/api/channels");
      if (!res.ok) throw new Error("Failed to load channels");
      return res.json();
    },
  });

  const addChannelMutation = useMutation({
    mutationFn: async (channelUrl: string) => {
      const res = await fetch("/api/channels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channelUrl }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.message || "Failed to add channel");
      }
      return res.json();
    },
    onSuccess: (channel: Channel) => {
      setChannelInput("");
      setShowAddChannel(false);
      queryClient.invalidateQueries({ queryKey: ["channels"] });
      toast({
        title: "Channel added",
        description: `${channel.channelName} is now being followed.`,
      });
    },
    onError: (err: Error) => {
      toast({
        title: "Couldn't add channel",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const removeChannelMutation = useMutation({
    mutationFn: async (channelId: number) => {
      const res = await fetch(`/api/channels/${channelId}`, { method: "DELETE" });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.message || "Failed to remove channel");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["channels"] });
      toast({
        title: "Channel removed",
        description: "This channel will no longer be tracked.",
      });
    },
    onError: (err: Error) => {
      toast({
        title: "Couldn't remove channel",
        description: err.message,
        variant: "destructive",
      });
    },
    onSettled: () => setRemovingId(null),
  });

  const recentCounts = useMemo(() => {
    const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
    const counts = new Map<string, number>();

    videos.forEach((video) => {
      const createdAt = video.createdAt ? new Date(video.createdAt).getTime() : 0;
      if (createdAt < oneDayAgo || !video.sourceChannelId) return;
      counts.set(video.sourceChannelId, (counts.get(video.sourceChannelId) || 0) + 1);
    });

    return counts;
  }, [videos]);

  const filteredVideos = useMemo(() => {
    if (selectedChannelId === "all") return videos;
    const channel = channels.find((item) => item.id === selectedChannelId);
    if (!channel) return videos;
    return videos.filter((video) => video.sourceChannelId === channel.channelId);
  }, [channels, selectedChannelId, videos]);

  const totalHoursSaved = Math.max(1, Math.round(videos.length * 0.25));

  const handleSummarize = (event: React.FormEvent) => {
    event.preventDefault();
    const url = summaryInput.trim();
    if (!url) return;

    createVideo(
      { url },
      {
        onSuccess: () => setSummaryInput(""),
      },
    );
  };

  const handleAddChannel = (event?: React.FormEvent) => {
    event?.preventDefault();
    const url = channelInput.trim();
    if (!url) return;
    addChannelMutation.mutate(url);
  };

  const handleUpdateChannel = async (channel: Channel) => {
    setUpdatingId(channel.id);
    try {
      const res = await fetch(`/api/channels/${channel.id}/update`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || "Failed to update channel");

      queryClient.invalidateQueries({ queryKey: [api.videos.list.path] });
      queryClient.invalidateQueries({ queryKey: ["channels"] });
      toast({
        title: data.summarized > 0 ? `${data.summarized} new summaries` : "All caught up",
        description: data.message,
      });
    } catch (err: any) {
      toast({
        title: "Update failed",
        description: err.message || "Something went wrong. Please try again.",
        variant: "destructive",
      });
    } finally {
      setUpdatingId(null);
    }
  };

  const handleRemoveChannel = (channel: Channel) => {
    if (!confirm(`Remove ${channel.channelName}? New videos from this channel will no longer be tracked.`)) {
      return;
    }

    setRemovingId(channel.id);
    removeChannelMutation.mutate(channel.id);
  };

  return (
    <div className="min-h-screen bg-[#F6F6F8] text-foreground">
      <TopNav
        inputValue={summaryInput}
        isCreating={isCreatingVideo}
        isPanelOpen={rightPanelOpen}
        onInputChange={setSummaryInput}
        onSubmit={handleSummarize}
        onTogglePanel={() => setRightPanelOpen((value) => !value)}
      />

      <main
        className={`grid w-full gap-0 px-4 py-5 lg:px-6 ${
          rightPanelOpen ? "lg:grid-cols-[minmax(0,7fr)_minmax(320px,3fr)]" : "lg:grid-cols-1"
        }`}
      >
        <section className="min-w-0 pr-0 lg:pr-6">
          <ChannelFilterRow
            channels={channels}
            recentCounts={recentCounts}
            selectedChannelId={selectedChannelId}
            onSelect={setSelectedChannelId}
          />

          <div className="mt-5 space-y-3">
            {videosLoading ? (
              <LoadingState />
            ) : filteredVideos.length === 0 ? (
              <EmptyState />
            ) : (
              filteredVideos.map((video) => <SummaryCard key={video.id} video={video} />)
            )}
          </div>
        </section>

        {rightPanelOpen && (
          <RightPanel
            channels={channels}
            channelsLoading={channelsLoading}
            recentCounts={recentCounts}
            totalSummaries={videos.length}
            totalHoursSaved={totalHoursSaved}
            addChannelPending={addChannelMutation.isPending}
            channelInput={channelInput}
            removingId={removingId}
            showAddChannel={showAddChannel}
            updatingId={updatingId}
            onAddChannel={handleAddChannel}
            onChannelInputChange={setChannelInput}
            onRemoveChannel={handleRemoveChannel}
            onShowAddChannelChange={setShowAddChannel}
            onUpdateChannel={handleUpdateChannel}
          />
        )}
      </main>
    </div>
  );
}

function TopNav({
  inputValue,
  isCreating,
  isPanelOpen,
  onInputChange,
  onSubmit,
  onTogglePanel,
}: {
  inputValue: string;
  isCreating: boolean;
  isPanelOpen: boolean;
  onInputChange: (value: string) => void;
  onSubmit: (event: React.FormEvent) => void;
  onTogglePanel: () => void;
}) {
  return (
    <header className="sticky top-0 z-40 w-full border-b border-[#E3E3EA] bg-white">
      <form
        onSubmit={onSubmit}
        className="flex h-16 w-full items-center gap-3 px-4 lg:px-6"
      >
        <Link href="/" className="flex shrink-0 items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#F1F0FF] text-[#7F77DD]">
            <Sparkles className="h-5 w-5" />
          </span>
          <span className="font-display text-xl font-bold">Bytesize</span>
        </Link>

        <div className="relative min-w-0 flex-1">
          <Youtube className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-[#7F77DD]" />
          <Input
            value={inputValue}
            onChange={(event) => onInputChange(event.target.value)}
            placeholder="Paste a YouTube URL or search summaries..."
            className="h-11 rounded-lg border-[#DCDCE6] bg-white pl-11 pr-3 text-sm shadow-none focus-visible:ring-[#7F77DD]"
            disabled={isCreating}
          />
        </div>

        <Button
          type="submit"
          disabled={!inputValue.trim() || isCreating}
          className="h-11 shrink-0 rounded-lg bg-[#7F77DD] px-4 font-semibold text-white hover:bg-[#7169C9]"
        >
          {isCreating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
          <span className="hidden sm:inline">Summarize</span>
        </Button>

        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={isPanelOpen ? "Hide right panel" : "Show right panel"}
          className="h-10 w-10 shrink-0 rounded-lg text-muted-foreground hover:bg-[#F1F0FF] hover:text-[#7F77DD]"
          onClick={onTogglePanel}
        >
          {isPanelOpen ? <PanelRightClose className="h-5 w-5" /> : <PanelRightOpen className="h-5 w-5" />}
        </Button>
      </form>
    </header>
  );
}

function ChannelFilterRow({
  channels,
  recentCounts,
  selectedChannelId,
  onSelect,
}: {
  channels: Channel[];
  recentCounts: Map<string, number>;
  selectedChannelId: number | "all";
  onSelect: (id: number | "all") => void;
}) {
  const allNewCount = Array.from(recentCounts.values()).reduce((sum, count) => sum + count, 0);

  return (
    <div className="overflow-x-auto border-b border-[#E3E3EA] pb-4">
      <div className="flex min-w-max items-start gap-4">
        <button
          type="button"
          onClick={() => onSelect("all")}
          className="group flex w-16 flex-col items-center gap-1.5 text-center"
        >
          <span
            className={`relative flex h-12 w-12 items-center justify-center rounded-full bg-[#7F77DD] text-white transition-transform group-hover:scale-105 ${
              selectedChannelId === "all" ? "ring-2 ring-[#7F77DD] ring-offset-2" : ""
            }`}
          >
            <Grid3X3 className="h-5 w-5" />
            {allNewCount > 0 && <span className="absolute right-0 top-0 h-3 w-3 rounded-full border-2 border-white bg-red-500" />}
          </span>
          <span className={`w-full truncate text-[10px] ${selectedChannelId === "all" ? "text-[#7F77DD]" : "text-muted-foreground"}`}>
            All
          </span>
        </button>

        {channels.map((channel) => (
          <button
            key={channel.id}
            type="button"
            onClick={() => onSelect(channel.id)}
            className="group flex w-16 flex-col items-center gap-1.5 text-center"
          >
            <ChannelAvatar
              channel={channel}
              className={`h-12 w-12 transition-transform group-hover:scale-105 ${
                selectedChannelId === channel.id ? "ring-2 ring-[#7F77DD] ring-offset-2" : ""
              }`}
              showDot={(recentCounts.get(channel.channelId) || 0) > 0}
            />
            <span className={`w-full truncate text-[10px] ${selectedChannelId === channel.id ? "text-[#7F77DD]" : "text-muted-foreground"}`}>
              {channel.channelName}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function SummaryCard({ video }: { video: Video }) {
  return (
    <Link href={`/video/${video.id}`} className="group block">
      <article className="relative flex gap-4 rounded-lg border border-[#E3E3EA] bg-white p-3 transition-colors hover:border-[#7F77DD]">
        <div className="relative h-[70px] w-[110px] shrink-0 overflow-hidden rounded-md bg-[#ECECF2]">
          {video.thumbnailUrl ? (
            <img src={video.thumbnailUrl} alt={video.title} className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-muted-foreground">
              <Youtube className="h-6 w-6" />
            </div>
          )}
          <span className="absolute bottom-1 right-1 rounded bg-black/80 px-1.5 py-0.5 text-[10px] font-medium text-white">
            {video.duration || "--:--"}
          </span>
        </div>

        <div className="min-w-0 flex-1 pr-16">
          <h2 className="line-clamp-2 text-sm font-bold leading-5 text-foreground group-hover:text-[#7F77DD]">
            {video.title}
          </h2>
          <p className="mt-1 truncate text-xs text-muted-foreground">
            {video.sourceChannelName || "YouTube"} · {video.createdAt ? formatDistanceToNow(new Date(video.createdAt), { addSuffix: true }) : "recently"}
          </p>
          <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">
            {stripMarkdown(video.summary || "Generating summary...")}
          </p>
        </div>

        <span className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full border border-[#CFEADD] bg-[#EDF8F4] px-2 py-0.5 text-[11px] font-semibold text-[#1D9E75]">
          <CheckCircle2 className="h-3 w-3" />
          Ready
        </span>
      </article>
    </Link>
  );
}

function RightPanel({
  channels,
  channelsLoading,
  recentCounts,
  totalSummaries,
  totalHoursSaved,
  addChannelPending,
  channelInput,
  removingId,
  showAddChannel,
  updatingId,
  onAddChannel,
  onChannelInputChange,
  onRemoveChannel,
  onShowAddChannelChange,
  onUpdateChannel,
}: {
  channels: Channel[];
  channelsLoading: boolean;
  recentCounts: Map<string, number>;
  totalSummaries: number;
  totalHoursSaved: number;
  addChannelPending: boolean;
  channelInput: string;
  removingId: number | null;
  showAddChannel: boolean;
  updatingId: number | null;
  onAddChannel: (event?: React.FormEvent) => void;
  onChannelInputChange: (value: string) => void;
  onRemoveChannel: (channel: Channel) => void;
  onShowAddChannelChange: (value: boolean) => void;
  onUpdateChannel: (channel: Channel) => void;
}) {
  return (
    <aside className="hidden min-h-[calc(100vh-5rem)] border-l border-[#E3E3EA] bg-white pl-6 lg:block">
      <div className="sticky top-20">
        <section>
          <h2 className="text-sm font-semibold text-foreground">This week</h2>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <StatCard label="Summaries" value={totalSummaries.toString()} />
            <StatCard label="Hours saved" value={totalHoursSaved.toString()} valueClassName="text-[#1D9E75]" />
          </div>
        </section>

        <div className="my-6 h-px bg-[#E3E3EA]" />

        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-foreground">Channels</h2>
            {channelsLoading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
          </div>

          <div className="space-y-2">
            {channels.map((channel) => {
              const newCount = recentCounts.get(channel.channelId) || 0;
              const isUpdating = updatingId === channel.id;
              const isRemoving = removingId === channel.id;

              return (
                <div key={channel.id} className="flex items-center gap-3 rounded-lg border border-transparent px-1 py-2 hover:border-[#E3E3EA]">
                  <ChannelAvatar channel={channel} className="h-9 w-9" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{channel.channelName}</p>
                    <p className="truncate text-[11px] text-muted-foreground">
                      {new Date(channel.lastCheckedAt).toLocaleDateString()}
                    </p>
                  </div>
                  {newCount > 0 ? (
                    <span className="rounded-full bg-[#F1F0FF] px-2 py-0.5 text-[11px] font-semibold text-[#7F77DD]">
                      {newCount} new
                    </span>
                  ) : (
                    <span className="text-[11px] text-muted-foreground">up to date</span>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 rounded-md text-muted-foreground hover:text-[#7F77DD]"
                    onClick={() => onUpdateChannel(channel)}
                    disabled={isUpdating || isRemoving}
                    aria-label={`Update ${channel.channelName}`}
                  >
                    {isUpdating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 rounded-md text-muted-foreground hover:text-destructive"
                    onClick={() => onRemoveChannel(channel)}
                    disabled={isUpdating || isRemoving}
                    aria-label={`Remove ${channel.channelName}`}
                  >
                    {isRemoving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                  </Button>
                </div>
              );
            })}
          </div>

          {showAddChannel && (
            <form onSubmit={onAddChannel} className="mt-4 flex gap-2">
              <Input
                value={channelInput}
                onChange={(event) => onChannelInputChange(event.target.value)}
                placeholder="Paste channel URL"
                className="h-9 rounded-lg border-[#DCDCE6] text-sm"
                disabled={addChannelPending}
              />
              <Button
                type="submit"
                disabled={!channelInput.trim() || addChannelPending}
                className="h-9 rounded-lg bg-[#7F77DD] px-3 text-white hover:bg-[#7169C9]"
              >
                {addChannelPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              </Button>
            </form>
          )}

          <button
            type="button"
            className="mt-4 text-sm font-semibold text-[#7F77DD] hover:text-[#7169C9]"
            onClick={() => onShowAddChannelChange(!showAddChannel)}
          >
            + Add channel
          </button>
        </section>
      </div>
    </aside>
  );
}

function ChannelAvatar({
  channel,
  className,
  showDot = false,
}: {
  channel: Channel;
  className?: string;
  showDot?: boolean;
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const initial = channel.channelName.charAt(0).toUpperCase();

  return (
    <span className={`relative flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#F1F0FF] text-sm font-bold text-[#7F77DD] ${className || ""}`}>
      {channel.channelThumbnailUrl && !imageFailed ? (
        <img
          src={channel.channelThumbnailUrl}
          alt={channel.channelName}
          className="h-full w-full object-cover"
          onError={() => setImageFailed(true)}
        />
      ) : (
        initial
      )}
      {showDot && <span className="absolute right-0 top-0 h-3 w-3 rounded-full border-2 border-white bg-red-500" />}
    </span>
  );
}

function StatCard({
  label,
  value,
  valueClassName = "text-foreground",
}: {
  label: string;
  value: string;
  valueClassName?: string;
}) {
  return (
    <div className="rounded-lg border border-[#E3E3EA] bg-white p-3">
      <p className={`text-2xl font-bold leading-none ${valueClassName}`}>{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="flex items-center justify-center rounded-lg border border-[#E3E3EA] bg-white py-16">
      <Loader2 className="h-8 w-8 animate-spin text-[#7F77DD]" />
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-lg border border-dashed border-[#DCDCE6] bg-white py-16 text-center">
      <Youtube className="mx-auto h-9 w-9 text-muted-foreground/50" />
      <h2 className="mt-3 text-lg font-semibold">No summaries found</h2>
      <p className="mt-1 text-sm text-muted-foreground">Paste a YouTube URL in the top bar to create one.</p>
    </div>
  );
}

function stripMarkdown(value: string) {
  return value
    .replace(/[#*_>`~-]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
