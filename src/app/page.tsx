import Link from "next/link";
import {
  Shield,
  Search,
  BarChart3,
  Globe,
  ArrowRight,
  Zap,
  Lock,
  Eye,
} from "lucide-react";
import { Button } from "@/components/ui/button";

const features = [
  {
    icon: Search,
    title: "Claim Verification",
    description:
      "Analyze political claims and statements against verified databases and trusted sources in real time.",
  },
  {
    icon: BarChart3,
    title: "Trend Analysis",
    description:
      "Track misinformation patterns across social platforms and news outlets with advanced analytics.",
  },
  {
    icon: Globe,
    title: "Source Tracking",
    description:
      "Trace the origin and spread of election-related information across the web.",
  },
  {
    icon: Shield,
    title: "Integrity Scoring",
    description:
      "Assign credibility scores to sources and claims using transparent, explainable methodologies.",
  },
  {
    icon: Zap,
    title: "Real-Time Alerts",
    description:
      "Receive instant notifications when new misinformation campaigns are detected in your monitored regions.",
  },
  {
    icon: Lock,
    title: "Secure & Private",
    description:
      "Enterprise-grade security with end-to-end encryption and full compliance with data protection regulations.",
  },
];

const stats = [
  { value: "99.2%", label: "Detection Accuracy" },
  { value: "50M+", label: "Claims Analyzed" },
  { value: "<2s", label: "Avg. Response Time" },
  { value: "140+", label: "Countries Covered" },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-navy-950">
      {/* Navigation */}
      <nav className="border-b border-border/50 bg-navy-950/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-2">
              <Shield className="h-8 w-8 text-blue-accent" />
              <span className="text-xl font-bold text-foreground tracking-tight">
                TruthLens<span className="text-blue-accent"> AI</span>
              </span>
            </div>
            <div className="hidden md:flex items-center gap-8">
              <a
                href="#features"
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                Features
              </a>
              <a
                href="#stats"
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                Impact
              </a>
              <a
                href="#how-it-works"
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                How It Works
              </a>
            </div>
            <div className="flex items-center gap-3">
              <Link href="/login">
                <Button variant="ghost" size="sm">
                  Sign In
                </Button>
              </Link>
              <Link href="/register">
                <Button size="sm">Get Started</Button>
              </Link>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--navy-700)_0%,_transparent_60%)] opacity-50" />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-20 pb-28 text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-blue-accent/30 bg-blue-accent/10 px-4 py-1.5 text-sm text-blue-glow mb-8">
            <Eye className="h-3.5 w-3.5" />
            AI-Powered Election Intelligence
          </div>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-foreground max-w-4xl mx-auto leading-[1.1]">
            Defend Electoral Integrity with{" "}
            <span className="text-blue-accent">AI-Driven</span> Verification
          </h1>
          <p className="mt-6 text-lg sm:text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            TruthLens AI monitors, detects, and verifies election-related
            information in real time — empowering journalists, fact-checkers, and
            election officials with actionable intelligence.
          </p>
          <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link href="/register">
              <Button size="lg" className="gap-2 px-6">
                Start Free Trial
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
            <Link href="/login">
              <Button variant="outline" size="lg" className="px-6">
                Sign In to Dashboard
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section id="stats" className="border-y border-border/50 bg-navy-900/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            {stats.map((stat) => (
              <div key={stat.label} className="text-center">
                <p className="text-3xl sm:text-4xl font-bold text-blue-accent">
                  {stat.value}
                </p>
                <p className="mt-2 text-sm text-muted-foreground">
                  {stat.label}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-foreground">
              Comprehensive Verification Suite
            </h2>
            <p className="mt-4 text-lg text-muted-foreground max-w-2xl mx-auto">
              Purpose-built tools for election information integrity — from
              detection to analysis to reporting.
            </p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((feature) => (
              <div
                key={feature.title}
                className="group rounded-xl border border-border/50 bg-navy-800/50 p-6 hover:border-blue-accent/30 hover:bg-navy-800 transition-colors"
              >
                <div className="flex items-center justify-center h-12 w-12 rounded-lg bg-blue-accent/10 text-blue-accent mb-4">
                  <feature.icon className="h-6 w-6" />
                </div>
                <h3 className="text-lg font-semibold text-foreground mb-2">
                  {feature.title}
                </h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {feature.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section
        id="how-it-works"
        className="py-24 border-t border-border/50 bg-navy-900/30"
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-foreground">
              How TruthLens Works
            </h2>
            <p className="mt-4 text-lg text-muted-foreground max-w-2xl mx-auto">
              A three-step process from detection to verified intelligence.
            </p>
          </div>
          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                step: "01",
                title: "Monitor",
                description:
                  "Our system continuously scans social media, news outlets, and public statements for election-related claims.",
              },
              {
                step: "02",
                title: "Analyze",
                description:
                  "AI models cross-reference claims against verified databases, fact-check archives, and official records.",
              },
              {
                step: "03",
                title: "Report",
                description:
                  "Get clear, actionable reports with credibility scores, source analysis, and spread tracking.",
              },
            ].map((item) => (
              <div key={item.step} className="text-center">
                <div className="inline-flex items-center justify-center h-16 w-16 rounded-full border-2 border-blue-accent/30 text-blue-accent font-bold text-xl mb-6">
                  {item.step}
                </div>
                <h3 className="text-xl font-semibold text-foreground mb-3">
                  {item.title}
                </h3>
                <p className="text-muted-foreground leading-relaxed">
                  {item.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-24 border-t border-border/50">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl sm:text-4xl font-bold text-foreground">
            Ready to Protect Electoral Integrity?
          </h2>
          <p className="mt-4 text-lg text-muted-foreground max-w-xl mx-auto">
            Join thousands of journalists, fact-checkers, and election officials
            using TruthLens AI to combat misinformation.
          </p>
          <div className="mt-10">
            <Link href="/register">
              <Button size="lg" className="gap-2 px-8">
                Get Started — It&apos;s Free
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/50 bg-navy-900/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-2">
              <Shield className="h-6 w-6 text-blue-accent" />
              <span className="text-lg font-bold text-foreground">
                TruthLens<span className="text-blue-accent"> AI</span>
              </span>
            </div>
            <div className="flex items-center gap-6 text-sm text-muted-foreground">
              <a href="#" className="hover:text-foreground transition-colors">
                Privacy
              </a>
              <a href="#" className="hover:text-foreground transition-colors">
                Terms
              </a>
              <a href="#" className="hover:text-foreground transition-colors">
                Contact
              </a>
              <a href="#" className="hover:text-foreground transition-colors">
                Documentation
              </a>
            </div>
          </div>
          <div className="mt-8 text-center text-xs text-muted-foreground">
            © 2026 TruthLens AI. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
}
