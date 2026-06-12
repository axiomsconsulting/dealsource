import { Link } from "@tanstack/react-router";
import { cn } from "@/lib/utils";

export function AdminTabs({ active }: { active: "feedback" | "users" }) {
  const tabs = [
    { key: "feedback", to: "/admin/feedback", label: "Feedback" },
    { key: "users", to: "/admin/users", label: "Users" },
  ] as const;

  return (
    <div className="mb-4 flex items-center gap-1 border-b">
      {tabs.map((t) => (
        <Link
          key={t.key}
          to={t.to}
          className={cn(
            "border-b-2 px-3 py-2 text-sm font-medium",
            active === t.key
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground",
          )}
        >
          {t.label}
        </Link>
      ))}
    </div>
  );
}
