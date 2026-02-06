import { useVideos } from "@/hooks/use-videos";
import { CreateVideoForm } from "@/components/CreateVideoForm";
import { VideoList } from "@/components/VideoList";
import { Header } from "@/components/Header";
import { Loader2 } from "lucide-react";
import { motion } from "framer-motion";

export default function Home() {
  const { data: videos, isLoading } = useVideos();

  return (
    <div className="min-h-screen bg-background selection:bg-primary/20">
      <Header />
      
      <main className="container mx-auto px-4 py-12 md:py-20">
        <section className="mb-20 text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <h1 className="text-4xl md:text-6xl font-display font-bold text-foreground mb-6 tracking-tight">
              Transform <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-purple-600">Video into Knowledge</span>
            </h1>
            <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto mb-10">
              Get AI-powered summaries and transcripts from any YouTube video in seconds. 
              Save time and learn faster.
            </p>
          </motion.div>
          
          <CreateVideoForm />
        </section>

        <section>
          <div className="flex items-center justify-between mb-8">
            <h2 className="text-2xl font-display font-semibold">Recent Summaries</h2>
          </div>
          
          {isLoading ? (
            <div className="flex justify-center items-center py-20">
              <Loader2 className="w-10 h-10 animate-spin text-primary/50" />
            </div>
          ) : (
            <VideoList videos={videos || []} />
          )}
        </section>
      </main>
      
      <footer className="py-8 border-t border-border/40 text-center text-sm text-muted-foreground">
        <p>© 2026 Bytesize. Powered by AI.</p>
      </footer>
    </div>
  );
}
