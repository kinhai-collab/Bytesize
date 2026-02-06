import { Link } from "wouter";
import { type Video } from "@shared/schema";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Clock, PlayCircle, Trash2, CheckCircle2, AlertCircle } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useDeleteVideo } from "@/hooks/use-videos";
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from "framer-motion";

interface VideoListProps {
  videos: Video[];
}

export function VideoList({ videos }: VideoListProps) {
  const { mutate: deleteVideo } = useDeleteVideo();

  if (videos.length === 0) {
    return (
      <div className="text-center py-20 bg-muted/30 rounded-3xl border border-dashed border-muted-foreground/20">
        <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
          <PlayCircle className="w-8 h-8 text-muted-foreground/50" />
        </div>
        <h3 className="text-xl font-display font-semibold text-foreground">No videos yet</h3>
        <p className="text-muted-foreground mt-2">Paste a YouTube URL above to get started.</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      <AnimatePresence>
        {videos.map((video, index) => (
          <motion.div
            key={video.id}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ duration: 0.2, delay: index * 0.05 }}
            layout
          >
            <VideoCard video={video} onDelete={() => deleteVideo(video.id)} />
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

function VideoCard({ video, onDelete }: { video: Video; onDelete: () => void }) {
  return (
    <Card className="group relative overflow-hidden rounded-2xl border-border/50 hover:border-primary/50 transition-all duration-300 hover:shadow-xl hover:shadow-primary/5 bg-card h-full flex flex-col">
      <Link href={`/video/${video.id}`} className="block flex-grow cursor-pointer">
        <div className="aspect-video bg-muted relative overflow-hidden">
          {video.thumbnailUrl ? (
            <img 
              src={video.thumbnailUrl} 
              alt={video.title} 
              className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-secondary">
              <PlayCircle className="w-12 h-12 text-muted-foreground/30" />
            </div>
          )}
          
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-end p-4">
            <span className="text-white font-medium text-sm flex items-center">
              View Summary <ArrowUpRightIcon className="w-4 h-4 ml-1" />
            </span>
          </div>

          <div className="absolute top-3 right-3">
            {video.processed ? (
              <Badge variant="secondary" className="bg-green-500/90 text-white backdrop-blur-sm shadow-sm">
                <CheckCircle2 className="w-3 h-3 mr-1" /> Ready
              </Badge>
            ) : (
              <Badge variant="secondary" className="bg-amber-500/90 text-white backdrop-blur-sm shadow-sm animate-pulse">
                <Clock className="w-3 h-3 mr-1" /> Processing
              </Badge>
            )}
          </div>
        </div>

        <div className="p-5">
          <h3 className="font-display font-semibold text-lg line-clamp-2 mb-2 group-hover:text-primary transition-colors">
            {video.title}
          </h3>
          <p className="text-sm text-muted-foreground line-clamp-3">
            {video.summary || "Generating summary..."}
          </p>
          
          <div className="mt-4 flex items-center text-xs text-muted-foreground">
            <Clock className="w-3 h-3 mr-1" />
            {formatDistanceToNow(new Date(video.createdAt!), { addSuffix: true })}
          </div>
        </div>
      </Link>

      <div className="absolute top-3 left-3 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
        <Button
          variant="destructive"
          size="icon"
          className="h-8 w-8 rounded-full shadow-lg"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
        >
          <Trash2 className="w-4 h-4" />
        </Button>
      </div>
    </Card>
  );
}

function ArrowUpRightIcon(props: any) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M7 7h10v10" />
      <path d="M7 17 17 7" />
    </svg>
  );
}
