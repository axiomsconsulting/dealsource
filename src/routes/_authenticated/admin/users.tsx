import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { AdminTabs } from "@/components/AdminTabs";
import { listUsersWithStats, updateUserRole, deleteUser } from "@/lib/admin.functions";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";
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
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((u) => (
              <TableRow key={u.id}>
                <TableCell className="whitespace-nowrap">
                  <Link to="/admin/users/$id" params={{ id: u.id }} className="hover:underline">
                    {u.email}
                  </Link>
                </TableCell>
                <TableCell className="whitespace-nowrap">{u.display_name ?? "—"}</TableCell>
                <TableCell className="whitespace-nowrap text-xs">
                  {new Date(u.created_at).toLocaleDateString()}
                </TableCell>
                <TableCell className="whitespace-nowrap text-xs">{u.properties_count}</TableCell>
                <TableCell className="whitespace-nowrap text-xs">
                  {u.last_login_at ? new Date(u.last_login_at).toLocaleString() : "Never"}
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
