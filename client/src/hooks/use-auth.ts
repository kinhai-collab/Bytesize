import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export type AuthUser = {
  id: number;
  email: string;
  displayName: string | null;
  provider: string;
};

export type AuthOptions = {
  google: boolean;
  apple: boolean;
};

export function useAuth() {
  return useQuery({
    queryKey: ["auth", "me"],
    queryFn: async () => {
      const res = await fetch("/api/auth/me", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load profile");
      return (await res.json()) as { user: AuthUser | null };
    },
  });
}

export function useAuthOptions() {
  return useQuery({
    queryKey: ["auth", "options"],
    queryFn: async () => {
      const res = await fetch("/api/auth/options", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load sign-in options");
      return (await res.json()) as AuthOptions;
    },
  });
}

export function useLogin() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      email,
      displayName,
      provider = "email",
    }: {
      email: string;
      displayName?: string;
      provider?: string;
    }) => {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, displayName, provider }),
      });

      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.message || "Could not sign in");
      return data as { user: AuthUser };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["auth", "me"] });
      queryClient.invalidateQueries({ queryKey: ["/api/videos"] });
      queryClient.invalidateQueries({ queryKey: ["channels"] });
    },
  });
}

export function useLogout() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok && res.status !== 204) throw new Error("Could not sign out");
    },
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: ["/api/videos"] });
      queryClient.removeQueries({ queryKey: ["channels"] });
      queryClient.setQueryData(["auth", "me"], { user: null });
      queryClient.invalidateQueries({ queryKey: ["auth", "me"] });
    },
  });
}
