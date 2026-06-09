import { useEffect, useState } from "react";
import { Apple, Loader2, Mail, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useAuthOptions, useLogin } from "@/hooks/use-auth";

export default function Login() {
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const login = useLogin();
  const authOptions = useAuthOptions();
  const { toast } = useToast();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const authError = params.get("authError");
    if (!authError) return;

    toast({
      title: "Couldn't sign in",
      description: authError,
      variant: "destructive",
    });
    window.history.replaceState({}, "", window.location.pathname);
  }, [toast]);

  const startOAuth = (provider: "google" | "apple") => {
    if (authOptions.data && !authOptions.data[provider]) {
      toast({
        title: `${provider === "google" ? "Google" : "Apple ID"} sign-in is not configured yet`,
        description: "Use email sign-in for now, or add the provider credentials in Replit Secrets.",
        variant: "destructive",
      });
      return;
    }

    window.location.href = `/api/auth/${provider}`;
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    login.mutate(
      { email: email.trim(), displayName: displayName.trim(), provider: "email" },
      {
        onError: (error) => {
          toast({
            title: "Couldn't sign in",
            description: error.message,
            variant: "destructive",
          });
        },
      },
    );
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#F6F6F8] px-4 py-10 text-foreground">
      <section className="w-full max-w-md rounded-lg border border-[#E3E3EA] bg-white p-6">
        <div className="mb-6 flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#F1F0FF] text-[#7F77DD]">
            <Sparkles className="h-5 w-5" />
          </span>
          <div>
            <h1 className="font-display text-2xl font-bold">Bytesize</h1>
            <p className="text-sm text-muted-foreground">Sign in to your profile</p>
          </div>
        </div>

        <div className="mb-4 grid grid-cols-2 gap-2">
          <Button
            type="button"
            variant="outline"
            className="h-11 rounded-lg"
            onClick={() => startOAuth("google")}
            disabled={authOptions.isLoading}
          >
            <Mail className="mr-2 h-4 w-4" />
            Gmail
          </Button>
          <Button
            type="button"
            variant="outline"
            className="h-11 rounded-lg"
            onClick={() => startOAuth("apple")}
            disabled={authOptions.isLoading}
          >
            <Apple className="mr-2 h-4 w-4" />
            Apple ID
          </Button>
        </div>

        <div className="mb-4 flex items-center gap-3 text-xs text-muted-foreground">
          <span className="h-px flex-1 bg-[#E3E3EA]" />
          <span>Email</span>
          <span className="h-px flex-1 bg-[#E3E3EA]" />
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <Input
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@example.com"
            type="email"
            autoComplete="email"
            className="h-11 rounded-lg"
            disabled={login.isPending}
          />
          <Input
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            placeholder="Display name"
            autoComplete="name"
            className="h-11 rounded-lg"
            disabled={login.isPending}
          />
          <Button
            type="submit"
            disabled={!email.trim() || login.isPending}
            className="h-11 w-full rounded-lg bg-[#7F77DD] text-white hover:bg-[#7169C9]"
          >
            {login.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Mail className="mr-2 h-4 w-4" />}
            Continue
          </Button>
        </form>
      </section>
    </main>
  );
}
