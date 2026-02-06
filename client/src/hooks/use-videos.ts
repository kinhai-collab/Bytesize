import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl, type CreateVideoInput } from "@shared/routes";
import { useToast } from "@/hooks/use-toast";

// GET /api/videos
export function useVideos() {
  return useQuery({
    queryKey: [api.videos.list.path],
    queryFn: async () => {
      const res = await fetch(api.videos.list.path);
      if (!res.ok) throw new Error("Failed to fetch videos");
      return api.videos.list.responses[200].parse(await res.json());
    },
  });
}

// GET /api/videos/:id
export function useVideo(id: number) {
  return useQuery({
    queryKey: [api.videos.get.path, id],
    enabled: !isNaN(id),
    queryFn: async () => {
      const url = buildUrl(api.videos.get.path, { id });
      const res = await fetch(url);
      
      if (res.status === 404) return null;
      if (!res.ok) throw new Error("Failed to fetch video");
      
      return api.videos.get.responses[200].parse(await res.json());
    },
  });
}

// POST /api/videos
export function useCreateVideo() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (data: CreateVideoInput) => {
      const validated = api.videos.create.input.parse(data);
      const res = await fetch(api.videos.create.path, {
        method: api.videos.create.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validated),
      });

      if (!res.ok) {
        if (res.status === 400) {
          const error = api.videos.create.responses[400].parse(await res.json());
          throw new Error(error.message);
        }
        throw new Error("Failed to summarize video");
      }

      return api.videos.create.responses[201].parse(await res.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.videos.list.path] });
      toast({
        title: "Video processing started",
        description: "Your summary will be ready shortly.",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}

// DELETE /api/videos/:id
export function useDeleteVideo() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (id: number) => {
      const url = buildUrl(api.videos.delete.path, { id });
      const res = await fetch(url, {
        method: api.videos.delete.method,
      });

      if (!res.ok && res.status !== 404) {
        throw new Error("Failed to delete video");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.videos.list.path] });
      toast({
        title: "Video deleted",
        description: "The summary has been removed.",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}
