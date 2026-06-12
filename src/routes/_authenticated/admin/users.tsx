import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { AdminTabs } from "@/components/AdminTabs";
import { listUsers, updateUserRole } from "@/lib/admin.functions";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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

  const getUsers = useServerFn(listUsers);
  const setRole = useServerFn(updateUserRole);
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
              <TableHead>Role</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((u) => (
              <TableRow key={u.id}>
                <TableCell className="whitespace-nowrap">{u.email}</TableCell>
                <TableCell className="whitespace-nowrap">{u.display_name ?? "—"}</TableCell>
                <TableCell className="whitespace-nowrap text-xs">
                  {new Date(u.created_at).toLocaleDateString()}
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
