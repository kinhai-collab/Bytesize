import { useState } from "react";
import { useCreateVideo } from "@/hooks/use-videos";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Loader2, Youtube, ArrowRight } from "lucide-react";
import { motion } from "framer-motion";

export function CreateVideoForm() {
  const [url, setUrl] = useState("");
  const { mutate, isPending } = useCreateVideo();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!url) return;
    
    mutate({ url }, {
      onSuccess: () => setUrl("")
    });
  };

  return (
    <div className="w-full max-w-2xl mx-auto">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <Card className="p-2 pl-4 rounded-2xl shadow-xl shadow-primary/5 border-primary/10 bg-background/50 backdrop-blur-sm">
          <form onSubmit={handleSubmit} className="flex gap-2 items-center">
            <div className="text-muted-foreground pl-2">
              <Youtube className="w-5 h-5" />
            </div>
            <Input 
              placeholder="Paste a YouTube URL to summarize..." 
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className="border-0 shadow-none bg-transparent h-12 text-lg focus-visible:ring-0 placeholder:text-muted-foreground/50"
              disabled={isPending}
            />
            <Button 
              size="lg" 
              type="submit" 
              disabled={!url || isPending}
              className="rounded-xl px-6 font-semibold bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg shadow-primary/20 hover:shadow-primary/30 transition-all duration-300"
            >
              {isPending ? (
                <>
                  <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                  Processing
                </>
              ) : (
                <>
                  Summarize
                  <ArrowRight className="w-5 h-5 ml-2" />
                </>
              )}
            </Button>
          </form>
        </Card>
      </motion.div>
      
      <motion.p 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.2 }}
        className="text-center mt-4 text-sm text-muted-foreground"
      >
        Supports standard YouTube videos. Processing takes 30-60 seconds.
      </motion.p>
    </div>
  );
}
