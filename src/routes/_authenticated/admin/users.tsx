import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { AdminTabs } from "@/components/AdminTabs";
import {
  listUsersWithStats,
  updateUserRole,
  deleteUser,
  startImpersonation,
} from "@/lib/admin.functions";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Trash2, ChevronRight, UserCog } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/admin/users")({
  head: () => ({ meta: [{ title: "Admin — Users" }] }),
  component: AdminUsersPage,
});

function AdminUsersPage() {
  const { role } = Route.useRouteContext();
  const isSuperAdmin = role === "super_admin";

  const getUsers = useServerFn(listUsersWithStats);
  const setRole = useServerFn(updateUserRole);
  const removeUser = useServerFn(deleteUser);
  const startImpersonationFn = useServerFn(startImpersonation);
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({ queryKey: ["admin", "users"], queryFn: () => getUsers() });
  const users = data ?? [];

  const roleMut = useMutation({
    mutationFn: (vars: { userId: string; role: "user" | "admin" | "super_admin" }) =>
      setRole({ data: vars }),
    onSuccess: () => {
      toast.success("Role updated");
      qc.invalidateQueries({ queryKey: ["admin", "users"] });
    },
    onError: (e: Error) => toast.error(e.message || "Couldn't update role"),
  });

  const deleteMut = useMutation({
    mutationFn: (userId: string) => removeUser({ data: { userId } }),
    onSuccess: () => {
      toast.success("User deleted");
      qc.invalidateQueries({ queryKey: ["admin", "users"] });
    },
    onError: (e: Error) => toast.error(e.message || "Couldn't delete user"),
  });

  const impersonateMut = useMutation({
    mutationFn: async (userId: string) => {
      const { tokenHash } = await startImpersonationFn({ data: { userId } });
      // Open in a brand-new tab — the storage shim in that tab isolates the
      // Supabase session to that tab only, so this admin tab stays signed in
      // as the admin.
      const w = window.open(`/impersonate-as/${tokenHash}`, "_blank", "noopener");
      if (!w) toast.error("Pop-up blocked — allow pop-ups for this site to impersonate.");
    },
    onError: (e: Error) => toast.error(e.message || "Couldn't impersonate"),
  });

  return (
    <AppShell title="Admin — Users">
      <AdminTabs active="users" />
      {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Email</TableHead>
              <TableHead>Display name</TableHead>
              <TableHead>Joined</TableHead>
              <TableHead>Properties</TableHead>
              <TableHead>Last login</TableHead>
              <TableHead>Role</TableHead>
              {isSuperAdmin && <TableHead className="w-10" />}
              <TableHead className="w-8" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((u) => (
              <TableRow key={u.id} className="hover:bg-muted/50">
                <TableCell className="whitespace-nowrap font-medium">
                  <div className="flex items-center gap-2">
                    <Link
                      to="/admin/users/$id"
                      params={{ id: u.id }}
                      className="hover:underline"
                    >
                      {u.email}
                    </Link>
                    {isSuperAdmin && u.role !== "super_admin" && (
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-6 w-6"
                        title="Impersonate in a new tab (isolated session)"
                        aria-label={`Impersonate ${u.email} in a new tab`}
                        disabled={impersonateMut.isPending}
                        onClick={() => impersonateMut.mutate(u.id)}
                      >
                        <UserCog className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </TableCell>
                <TableCell className="whitespace-nowrap">
                  <Link to="/admin/users/$id" params={{ id: u.id }} className="block hover:underline">
                    {u.display_name ?? "—"}
                  </Link>
                </TableCell>
                <TableCell className="whitespace-nowrap text-xs">
                  <Link to="/admin/users/$id" params={{ id: u.id }} className="block">
                    {new Date(u.created_at).toLocaleDateString()}
                  </Link>
                </TableCell>
                <TableCell className="whitespace-nowrap text-xs">
                  <Link to="/admin/users/$id" params={{ id: u.id }} className="block">
                    {u.properties_count}
                  </Link>
                </TableCell>
                <TableCell className="whitespace-nowrap text-xs">
                  <Link to="/admin/users/$id" params={{ id: u.id }} className="block">
                    {u.last_login_at ? new Date(u.last_login_at).toLocaleString() : "Never"}
                  </Link>
                </TableCell>
                <TableCell>
                  {isSuperAdmin && u.role !== "super_admin" ? (
                    <Select
                      value={u.role}
                      onValueChange={(v) =>
                        roleMut.mutate({
                          userId: u.id,
                          role: v as "user" | "admin" | "super_admin",
                        })
                      }
                    >
                      <SelectTrigger className="w-36">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="user">User</SelectItem>
                        <SelectItem value="admin">Admin</SelectItem>
                        <SelectItem value="super_admin">Super admin</SelectItem>
                      </SelectContent>
                    </Select>
                  ) : (
                    <Badge variant="outline" className="capitalize">
                      {u.role.replace("_", " ")}
                    </Badge>
                  )}
                </TableCell>
                {isSuperAdmin && (
                  <TableCell>
                    {u.role !== "super_admin" && (
                      <Button
                        size="icon"
                        variant="ghost"
                        title="Delete user"
                        disabled={deleteMut.isPending}
                        onClick={() => {
                          if (confirm(`Delete ${u.email}? This permanently removes their account and data.`)) {
                            deleteMut.mutate(u.id);
                          }
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </TableCell>
                )}
                <TableCell className="w-8 text-muted-foreground">
                  <Link to="/admin/users/$id" params={{ id: u.id }} aria-label="Open user">
                    <ChevronRight className="h-4 w-4" />
                  </Link>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
      {!isSuperAdmin && (
        <p className="mt-3 text-xs text-muted-foreground">
          Only super admins can change user roles.
        </p>
      )}
    </AppShell>
  );
}
