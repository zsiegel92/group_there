import type { ReactNode } from "react";

const colors = {
  purple: "bg-purple-100 text-purple-700",
  green: "bg-green-100 text-green-700",
  gray: "bg-gray-100 text-gray-700",
  blue: "bg-blue-100 text-blue-700",
  yellow: "bg-yellow-100 text-yellow-700",
  teal: "bg-teal-100 text-teal-700",
} as const;

function Badge({
  children,
  color,
  size = "normal",
}: {
  children: ReactNode;
  color: keyof typeof colors;
  size?: "small" | "normal";
}) {
  const sizeClasses =
    size === "small" ? "px-2 py-0.5 text-xs font-normal" : "px-2 py-1 text-sm";
  return (
    <span className={`${sizeClasses} rounded ${colors[color]}`}>
      {children}
    </span>
  );
}

export function AdminBadge({ children = "Admin" }: { children?: ReactNode }) {
  return <Badge color="purple">{children}</Badge>;
}

export function JoinedBadge() {
  return <Badge color="green">Joined</Badge>;
}

export function NotJoinedBadge() {
  return <Badge color="gray">Not Joined</Badge>;
}

export function ScheduledBadge() {
  return <Badge color="green">Scheduled</Badge>;
}

export function UnscheduledBadge() {
  return <Badge color="yellow">Unscheduled (Not visible to members)</Badge>;
}

export function YouBadge() {
  return (
    <Badge color="teal" size="small">
      You
    </Badge>
  );
}
