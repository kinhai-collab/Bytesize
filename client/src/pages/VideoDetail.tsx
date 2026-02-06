import { useVideo, useDeleteVideo } from "@/hooks/use-videos";
import { useRoute, useLocation } from "wouter";
import { Header } from "@/components/Header";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import ReactPlayer from "react-player";
import { Loader2, ArrowLeft, Trash2, Copy, Check } from "lucide-react";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { motion } from "framer-motion";

export default function VideoDetail() {
  const [, params] = useRoute("/video/:id");
  const [, setLocation] = useLocation();
  const id = params ? parseInt(params.id) : 0;
  
  const { data: video, isLoading } = useVideo(id);
  const { mutate: deleteVideo } = useDeleteVideo();
  const { toast } = useToast();
  
  const [copied, setCopied] = useState(false);

  const handleDelete = () => {
    if (confirm("Are you sure you want to delete this summary?")) {
      deleteVideo(id, {
        onSuccess: () => setLocation("/")
      });
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    toast({ title: "Copied to clipboard" });
    setTimeout(() => setCopied(false), 2000);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <Header />
        <div className="flex-grow flex items-center justify-center">
          <Loader2 className="w-10 h-10 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  if (!video) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <Header />
        <div className="flex-grow flex flex-col items-center justify-center p-4 text-center">
          <h2 className="text-2xl font-bold mb-2">Video not found</h2>
          <Button onClick={() => setLocation("/")} variant="outline">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Go Home
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      
      <main className="container mx-auto px-4 py-8">
        <Button 
          variant="ghost" 
          onClick={() => setLocation("/")}
          className="mb-6 pl-0 hover:pl-2 transition-all text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Dashboard
        </Button>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left Column: Video Player & Meta */}
          <div className="lg:col-span-2 space-y-6">
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="rounded-2xl overflow-hidden shadow-2xl shadow-black/5 bg-black aspect-video"
            >
              <ReactPlayer 
                url={video.url} 
                width="100%" 
                height="100%" 
                controls 
              />
            </motion.div>

            <div>
              <div className="flex justify-between items-start gap-4">
                <h1 className="text-2xl md:text-3xl font-display font-bold leading-tight">
                  {video.title}
                </h1>
                <Button variant="ghost" size="icon" onClick={handleDelete} className="text-destructive hover:bg-destructive/10 shrink-0">
                  <Trash2 className="w-5 h-5" />
                </Button>
              </div>
              <p className="text-sm text-muted-foreground mt-2">
                Processed {new Date(video.createdAt!).toLocaleDateString()}
              </p>
            </div>
          </div>

          {/* Right Column: Content */}
          <motion.div 
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2 }}
            className="lg:col-span-1"
          >
            <div className="sticky top-24 bg-card rounded-2xl border border-border/50 shadow-lg shadow-black/5 overflow-hidden flex flex-col h-[calc(100vh-8rem)]">
              <Tabs defaultValue="summary" className="flex flex-col h-full">
                <div className="p-4 border-b border-border/50 bg-secondary/30">
                  <TabsList className="w-full grid grid-cols-2">
                    <TabsTrigger value="summary">Summary</TabsTrigger>
                    <TabsTrigger value="transcript">Transcript</TabsTrigger>
                  </TabsList>
                </div>

                <div className="flex-grow overflow-hidden relative bg-card">
                  <TabsContent value="summary" className="h-full m-0">
                    <ScrollArea className="h-full">
                      <div className="p-6">
                        {video.summary ? (
                          <div className="prose prose-sm md:prose-base dark:prose-invert max-w-none">
                            <div className="flex justify-end mb-2">
                              <Button 
                                variant="ghost" 
                                size="sm" 
                                className="h-8 text-xs"
                                onClick={() => copyToClipboard(video.summary || "")}
                              >
                                {copied ? <Check className="w-3 h-3 mr-1" /> : <Copy className="w-3 h-3 mr-1" />}
                                {copied ? "Copied" : "Copy"}
                              </Button>
                            </div>
                            <div className="whitespace-pre-wrap leading-relaxed text-muted-foreground">
                              {video.summary}
                            </div>
                          </div>
                        ) : (
                          <div className="flex flex-col items-center justify-center h-64 text-center p-6">
                            <Loader2 className="w-8 h-8 animate-spin text-primary mb-4" />
                            <h3 className="font-semibold">Generating Summary</h3>
                            <p className="text-sm text-muted-foreground mt-1">
                              Our AI is watching the video for you. This usually takes about a minute.
                            </p>
                          </div>
                        )}
                      </div>
                    </ScrollArea>
                  </TabsContent>

                  <TabsContent value="transcript" className="h-full m-0">
                    <ScrollArea className="h-full">
                      <div className="p-6">
                         {video.transcript ? (
                          <div className="prose prose-sm dark:prose-invert max-w-none">
                            <div className="flex justify-end mb-2">
                              <Button 
                                variant="ghost" 
                                size="sm" 
                                className="h-8 text-xs"
                                onClick={() => copyToClipboard(video.transcript || "")}
                              >
                                {copied ? <Check className="w-3 h-3 mr-1" /> : <Copy className="w-3 h-3 mr-1" />}
                                {copied ? "Copied" : "Copy"}
                              </Button>
                            </div>
                            <p className="whitespace-pre-wrap font-mono text-xs leading-relaxed text-muted-foreground">
                              {video.transcript}
                            </p>
                          </div>
                        ) : (
                          <div className="flex flex-col items-center justify-center h-64 text-center p-6">
                             <p className="text-sm text-muted-foreground">Transcript not available yet.</p>
                          </div>
                        )}
                      </div>
                    </ScrollArea>
                  </TabsContent>
                </div>
              </Tabs>
            </div>
          </motion.div>
        </div>
      </main>
    </div>
  );
}
