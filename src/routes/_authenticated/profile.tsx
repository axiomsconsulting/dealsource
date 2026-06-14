import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getMyProfile, updateProfile } from "@/lib/profile.functions";
import { listProperties, updateProperty } from "@/lib/ingest.functions";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { fmtGBP } from "@/lib/format";
import { Bell, Loader2, LogOut, Star, UserRound } from "lucide-react";
import { toast } from "sonner";
import { SavedSearchesManager } from "@/components/SavedSearchesManager";

export const Route = createFileRoute("/_authenticated/profile")({
  head: () => ({ meta: [{ title: "Profile — Deal Negotiator" }] }),
  component: ProfilePage,
});

function ProfilePage() {
  return (
    <AppShell title="Profile">
      <Tabs defaultValue="account">
        <TabsList>
          <TabsTrigger value="account" className="gap-1.5">
            <UserRound className="h-4 w-4" /> Account
          </TabsTrigger>
          <TabsTrigger value="favourites" className="gap-1.5">
            <Star className="h-4 w-4" /> Favourites
          </TabsTrigger>
          <TabsTrigger value="reminders" className="gap-1.5">
            <Bell className="h-4 w-4" /> Reminders
          </TabsTrigger>
        </TabsList>
        <TabsContent value="account">
          <AccountTab />
        </TabsContent>
        <TabsContent value="favourites">
          <FavouritesTab />
        </TabsContent>
        <TabsContent value="reminders">
          <SavedSearchesManager />
        </TabsContent>
      </Tabs>
    </AppShell>
  );
}

function AccountTab() {
  const router = useRouter();
  const qc = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const getMyProfileFn = useServerFn(getMyProfile);
  const updateProfileFn = useServerFn(updateProfile);
  const profileQ = useQuery({ queryKey: ["my-profile"], queryFn: () => getMyProfileFn() });
  const profile = profileQ.data;

  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (profile?.display_name) setDisplayName(profile.display_name);
    if (profile?.email) setEmail(profile.email);
  }, [profile?.display_name, profile?.email]);

  const initials = (profile?.display_name || profile?.email || "?")
    .trim()
    .slice(0, 1)
    .toUpperCase();

  const saveNameMut = useMutation({
    mutationFn: () => updateProfileFn({ data: { displayName } }),
    onSuccess: () => {
      toast.success("Name updated");
      qc.invalidateQueries({ queryKey: ["my-profile"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const saveEmailMut = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.auth.updateUser({ email });
      if (error) throw error;
    },
    onSuccess: () => toast.success("Check your inbox to confirm the new email address"),
    onError: (e: Error) => toast.error(e.message),
  });

  const savePasswordMut = useMutation({
    mutationFn: async () => {
      if (password.length < 6) throw new Error("Password must be at least 6 characters");
      if (password !== confirmPassword) throw new Error("Passwords do not match");
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Password updated");
      setPassword("");
      setConfirmPassword("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const handleAvatarSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !profile) return;
    setUploading(true);
    try {
      const ext = file.name.split(".").pop() || "jpg";
      const path = `${profile.id}/avatar.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(path, file, { upsert: true });
      if (uploadError) throw uploadError;
      const { data: pub } = supabase.storage.from("avatars").getPublicUrl(path);
      await updateProfileFn({ data: { avatarUrl: pub.publicUrl } });
      toast.success("Photo updated");
      qc.invalidateQueries({ queryKey: ["my-profile"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    router.navigate({ to: "/auth" });
  };

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Photo</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center gap-4">
          <Avatar className="h-16 w-16">
            <AvatarImage src={profile?.avatar_url ?? undefined} alt="" />
            <AvatarFallback className="text-lg">{initials}</AvatarFallback>
          </Avatar>
          <div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleAvatarSelect}
            />
            <Button
              variant="outline"
              size="sm"
              disabled={uploading}
              onClick={() => fileInputRef.current?.click()}
            >
              {uploading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Change photo
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Display name</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="display-name">Name</Label>
            <Input
              id="display-name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
            />
          </div>
          <Button className="w-full sm:w-auto" onClick={() => saveNameMut.mutate()} disabled={saveNameMut.isPending}>
            {saveNameMut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Save name
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Email</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="email">Email address</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <Button className="w-full sm:w-auto" onClick={() => saveEmailMut.mutate()} disabled={saveEmailMut.isPending || !email}>
            {saveEmailMut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Update
            email
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Password</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="new-password">New password</Label>
            <Input
              id="new-password"
              type="password"
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="confirm-password">Confirm password</Label>
            <Input
              id="confirm-password"
              type="password"
              minLength={6}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />
          </div>
          <Button
            className="w-full sm:w-auto"
            onClick={() => savePasswordMut.mutate()}
            disabled={savePasswordMut.isPending || !password}
          >
            {savePasswordMut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Update
            password
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Sign out</CardTitle>
        </CardHeader>
        <CardContent>
          <Button className="w-full sm:w-auto" variant="outline" onClick={signOut}>
            <LogOut className="mr-2 h-4 w-4" /> Sign out
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function FavouritesTab() {
  const qc = useQueryClient();
  const list = useServerFn(listProperties);
  const update = useServerFn(updateProperty);
  const propertiesQ = useQuery({ queryKey: ["properties"], queryFn: () => list() });

  const unfavouriteMut = useMutation({
    mutationFn: (id: string) => update({ data: { id, patch: { favourite: false } } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["properties"] }),
  });

  const favourites = (
    (propertiesQ.data ?? []) as Array<{
      id: string;
      favourite: boolean;
      address: string;
      hide_address: boolean;
      asking_price_gbp: number | null;
      beds: number | null;
    }>
  ).filter((p) => p.favourite);

  if (propertiesQ.isLoading) return <p className="text-muted-foreground">Loading…</p>;
  if (!favourites.length)
    return (
      <Card className="p-12 text-center text-muted-foreground">No favourite properties yet.</Card>
    );

  return (
    <div className="space-y-3">
      {favourites.map((p) => (
        <Card key={p.id}>
          <CardContent className="flex items-center justify-between gap-4 pt-5">
            <div>
              <Link
                to="/properties/$id"
                params={{ id: p.id }}
                className="font-semibold hover:underline"
              >
                {p.hide_address ? "Property (address hidden)" : p.address}
              </Link>
              <p className="mt-1 text-sm text-muted-foreground">
                Asking {fmtGBP(p.asking_price_gbp)}
                {p.beds && (
                  <Badge variant="outline" className="ml-2">
                    {p.beds} bed
                  </Badge>
                )}
              </p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => unfavouriteMut.mutate(p.id)}
              title="Unfavourite"
            >
              <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
            </Button>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
