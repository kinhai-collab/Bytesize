// This is our new Channel Following component
// It handles: adding channels, listing them, and triggering the update/summarize action

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, RefreshCw, PlusCircle, Tv } from "lucide-react";
import { motion } from "framer-motion";
import { useToast } from "@/hooks/use-toast";

// This describes what a Channel object looks like
// It matches exactly what our database returns
interface Channel {
  id: number;
  channelUrl: string;
  channelName: string;
  channelId: string;
  lastCheckedAt: string;
  createdAt: string;
}

export function ChannelSection() {
  // "inputUrl" stores whatever the user is currently typing in the input box
  const [inputUrl, setInputUrl] = useState("");

  // "updatingId" tracks which channel is currently being updated (so we can show a spinner)
  const [updatingId, setUpdatingId] = useState<number | null>(null);

  // "toast" lets us show little popup notification messages
  const { toast } = useToast();

  // "queryClient" lets us refresh data after adding/updating channels
  const queryClient = useQueryClient();

  // This fetches all saved channels from GET /api/channels
  // It runs automatically when the component loads
  const { data: channels, isLoading } = useQuery<Channel[]>({
    queryKey: ["channels"], // A unique name for this data
    queryFn: async () => {
      const res = await fetch("/api/channels"); // Call our backend route
      if (!res.ok) throw new Error("Failed to load channels");
      return res.json(); // Return the list of channels
    },
  });

  // This handles adding a new channel when user clicks "Add Channel"
  const addChannelMutation = useMutation({
    mutationFn: async (channelUrl: string) => {
      const res = await fetch("/api/channels", {
        method: "POST", // POST means we're sending new data
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channelUrl }), // Send the URL the user typed
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Failed to add channel");
      }
      return res.json();
    },
    onSuccess: (newChannel) => {
      // When it works: clear the input, refresh the channel list, show success message
      setInputUrl("");
      queryClient.invalidateQueries({ queryKey: ["channels"] }); // Refresh channel list
      toast({
        title: "Channel added! ✅",
        description: `${newChannel.channelName} is now being followed.`,
      });
    },
    onError: (err: Error) => {
      // When it fails: show an error message
      toast({
        title: "Couldn't add channel",
        description: err.message,
        variant: "destructive", // "destructive" makes it show in red
      });
    },
  });

  // This handles clicking "Update" on a specific channel
  const handleUpdate = async (channel: Channel) => {
    setUpdatingId(channel.id); // Show spinner on this channel's button
    try {
      const res = await fetch(`/api/channels/${channel.id}/update`, {
        method: "POST", // POST to trigger the update
      });
      const data = await res.json();

      // Refresh the video list so new summaries appear immediately
      queryClient.invalidateQueries({ queryKey: ["videos"] });
      queryClient.invalidateQueries({ queryKey: ["channels"] });

      // Show a message telling the user how many new videos were found
      toast({
        title:
          data.summarized > 0
            ? `Found ${data.summarized} new video(s)! 🎉`
            : "All caught up!",
        description: data.message,
      });
    } catch (err) {
      toast({
        title: "Update failed",
        description: "Something went wrong. Please try again.",
        variant: "destructive",
      });
    } finally {
      setUpdatingId(null); // Hide the spinner no matter what
    }
  };

  // This runs when user clicks "Add Channel"
  const handleAddChannel = () => {
    const trimmed = inputUrl.trim(); // Remove any accidental spaces
    if (!trimmed) return; // Do nothing if input is empty
    addChannelMutation.mutate(trimmed); // Trigger the add channel action
  };

  return (
    <section className="mb-16">
      {/* Section heading */}
      <div className="flex items-center gap-2 mb-6">
        <Tv className="w-5 h-5 text-primary" />
        <h2 className="text-2xl font-display font-semibold">
          Followed Channels
        </h2>
      </div>

      {/* Input box for adding a new channel */}
      <div className="flex gap-2 mb-6">
        <Input
          placeholder="Paste a YouTube channel URL (e.g. https://www.youtube.com/@mkbhd)"
          value={inputUrl} // Controlled by our inputUrl state
          onChange={(e) => setInputUrl(e.target.value)} // Update state as user types
          onKeyDown={(e) => e.key === "Enter" && handleAddChannel()} // Allow pressing Enter
          className="flex-1"
        />
        <Button
          onClick={handleAddChannel}
          disabled={addChannelMutation.isPending || !inputUrl.trim()} // Disable if empty or loading
        >
          {addChannelMutation.isPending ? (
            <Loader2 className="w-4 h-4 animate-spin mr-2" /> // Spinner while adding
          ) : (
            <PlusCircle className="w-4 h-4 mr-2" /> // Plus icon normally
          )}
          Add Channel
        </Button>
      </div>

      {/* Loading spinner while fetching channels */}
      {isLoading && (
        <div className="flex justify-center py-8">
          <Loader2 className="w-8 h-8 animate-spin text-primary/50" />
        </div>
      )}

      {/* Empty state — shown when user has no channels yet */}
      {!isLoading && (!channels || channels.length === 0) && (
        <div className="text-center py-10 text-muted-foreground border border-dashed border-border rounded-xl">
          <Tv className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p>No channels followed yet.</p>
          <p className="text-sm mt-1">
            Paste a YouTube channel URL above to get started.
          </p>
        </div>
      )}

      {/* List of followed channels */}
      {channels && channels.length > 0 && (
        <div className="space-y-3">
          {channels.map((channel) => (
            <motion.div
              key={channel.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-center justify-between p-4 rounded-xl border border-border bg-card"
            >
              {/* Channel name and last checked time */}
              <div>
                <p className="font-medium">{channel.channelName}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Last checked:{" "}
                  {new Date(channel.lastCheckedAt).toLocaleString()}
                </p>
              </div>

              {/* Update button — shows spinner while updating */}
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleUpdate(channel)}
                disabled={updatingId === channel.id} // Disable while this channel is updating
              >
                {updatingId === channel.id ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                ) : (
                  <RefreshCw className="w-4 h-4 mr-2" />
                )}
                Update
              </Button>
            </motion.div>
          ))}
        </div>
      )}
    </section>
  );
}
