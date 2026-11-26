import Link from "next/link";
import {
  Shield,
  Search,
  BarChart3,
  AlertTriangle,
  CheckCircle,
  Globe,
  Clock,
  FilePlus2,
} from "lucide-react";
import { StatsCard } from "@/components/dashboard/stats-card";
import { DashboardCard } from "@/components/dashboard/dashboard-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const recentClaims = [
  {
    id: 1,
    claim: "Voter registration deadline extended to November 15th",
    source: "Social Media Post",
    status: "verified" as const,
    confidence: 94,
    time: "2 min ago",
  },
  {
    id: 2,
    claim: "Polling stations will close early in District 7",
    source: "News Article",
    status: "false" as const,
    confidence: 97,
    time: "15 min ago",
  },
  {
    id: 3,
    claim: "New voter ID requirements for mail-in ballots",
    source: "Government Press Release",
    status: "verified" as const,
    confidence: 99,
    time: "32 min ago",
  },
  {
    id: 4,
    claim: "Electronic voting machines compromised in 3 states",
    source: "Blog Post",
    status: "false" as const,
    confidence: 96,
    time: "1 hr ago",
  },
  {
    id: 5,
    claim: "Absentee ballot counting procedures updated",
    source: "Official Statement",
    status: "pending" as const,
    confidence: 72,
    time: "2 hr ago",
  },
];

function getStatusBadge(status: "verified" | "false" | "pending") {
  switch (status) {
    case "verified":
      return (
        <Badge className="bg-success/10 text-success border-success/30 hover:bg-success/20">
          <CheckCircle className="h-3 w-3 mr-1" />
          Verified
        </Badge>
      );
    case "false":
      return (
        <Badge className="bg-danger/10 text-danger border-danger/30 hover:bg-danger/20">
          <AlertTriangle className="h-3 w-3 mr-1" />
          False
        </Badge>
      );
    case "pending":
      return (
        <Badge className="bg-warning/10 text-warning border-warning/30 hover:bg-warning/20">
          <Clock className="h-3 w-3 mr-1" />
          Pending
        </Badge>
      );
  }
}

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Overview of election information verification activity
          </p>
        </div>
        <Link href="/dashboard/submit">
          <Button size="sm" className="gap-2">
            <FilePlus2 className="h-4 w-4" />
            Submit Content
          </Button>
        </Link>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatsCard
          title="Claims Analyzed"
          value="12,847"
          change="+12.5%"
          trend="up"
          icon={Search}
        />
        <StatsCard
          title="Verified True"
          value="8,234"
          change="+8.2%"
          trend="up"
          icon={CheckCircle}
        />
        <StatsCard
          title="Flagged False"
          value="3,891"
          change="-4.1%"
          trend="down"
          icon={AlertTriangle}
        />
        <StatsCard
          title="Sources Tracked"
          value="1,429"
          change="+23"
          trend="up"
          icon={Globe}
        />
      </div>

      {/* Content grid */}
      <div className="grid lg:grid-cols-3 gap-6">
        {/* Recent claims table — spans 2 columns */}
        <DashboardCard
          title="Recent Claims"
          description="Latest election claims being processed"
          icon={BarChart3}
          className="lg:col-span-2"
        >
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/50">
                  <th className="text-left py-3 px-2 text-muted-foreground font-medium">
                    Claim
                  </th>
                  <th className="text-left py-3 px-2 text-muted-foreground font-medium hidden sm:table-cell">
                    Source
                  </th>
                  <th className="text-left py-3 px-2 text-muted-foreground font-medium">
                    Status
                  </th>
                  <th className="text-right py-3 px-2 text-muted-foreground font-medium hidden md:table-cell">
                    Confidence
                  </th>
                </tr>
              </thead>
              <tbody>
                {recentClaims.map((claim) => (
                  <tr
                    key={claim.id}
                    className="border-b border-border/30 last:border-0"
                  >
                    <td className="py-3 px-2">
                      <p className="text-foreground line-clamp-1">
                        {claim.claim}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5 sm:hidden">
                        {claim.source}
                      </p>
                    </td>
                    <td className="py-3 px-2 text-muted-foreground hidden sm:table-cell">
                      {claim.source}
                    </td>
                    <td className="py-3 px-2">{getStatusBadge(claim.status)}</td>
                    <td className="py-3 px-2 text-right hidden md:table-cell">
                      <span
                        className={
                          claim.confidence >= 90
                            ? "text-success"
                            : claim.confidence >= 75
                            ? "text-warning"
                            : "text-muted-foreground"
                        }
                      >
                        {claim.confidence}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </DashboardCard>

        {/* Activity feed */}
        <DashboardCard
          title="Threat Alerts"
          description="Recent misinformation campaigns"
          icon={Shield}
        >
          <div className="space-y-4">
            {[
              {
                title: "Coordinated Bot Network",
                region: "Midwest US",
                severity: "High",
                time: "10 min ago",
              },
              {
                title: "Deepfake Video Detected",
                region: "Southeast US",
                severity: "Critical",
                time: "45 min ago",
              },
              {
                title: "Misleading Polling Data",
                region: "Northeast US",
                severity: "Medium",
                time: "2 hr ago",
              },
              {
                title: "Fake Voter Registration Site",
                region: "Southwest US",
                severity: "Critical",
                time: "3 hr ago",
              },
            ].map((alert, i) => (
              <div
                key={i}
                className="flex items-start gap-3 p-3 rounded-lg bg-navy-800/50 border border-border/30"
              >
                <div
                  className={`mt-0.5 h-2 w-2 rounded-full shrink-0 ${
                    alert.severity === "Critical"
                      ? "bg-danger"
                      : alert.severity === "High"
                      ? "bg-warning"
                      : "bg-blue-accent"
                  }`}
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground">
                    {alert.title}
                  </p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs text-muted-foreground">
                      {alert.region}
                    </span>
                    <span className="text-xs text-muted-foreground">·</span>
                    <span className="text-xs text-muted-foreground">
                      {alert.time}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </DashboardCard>
      </div>
    </div>
  );
}
