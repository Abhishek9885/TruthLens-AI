import { type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

interface DashboardCardProps {
  title: string;
  description?: string;
  icon?: LucideIcon;
  className?: string;
  children: React.ReactNode;
}

export function DashboardCard({
  title,
  description,
  icon: Icon,
  className,
  children,
}: DashboardCardProps) {
  return (
    <Card className={cn("bg-navy-800/50 border-border/50", className)}>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          {Icon && <Icon className="h-4.5 w-4.5 text-blue-accent" />}
          <CardTitle className="text-base font-semibold text-foreground">
            {title}
          </CardTitle>
        </div>
        {description && (
          <CardDescription className="text-sm text-muted-foreground">
            {description}
          </CardDescription>
        )}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}
