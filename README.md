# TruthLens AI

An AI-assisted election information verification and claim extraction platform designed to analyze election-related news, public claims, articles, and screenshot images.

## Key Capabilities

- **Multi-Modal Content Ingestion**
  - News article URL extraction with SSRF defense and destination verification
  - Manual text claim submissions with real-time validation
  - Screenshot image upload with on-device OCR text extraction using Tesseract.js
  - Preserved original images in private storage accessed via short-lived signed URLs

- **Intelligent Claim Extraction**
  - Server-side Google Gemini 2.5 Flash integration with prompt injection guardrails
  - Granular claim extraction into 9 civic categories and 6 claim types
  - Named entity recognition (Person, Organization, Location, Law/Policy)
  - Objective search query generation for investigative fact retrieval

- **Evidence Discovery & Fact-Checking Engine**
  - Official Google Fact Check Tools API Claim Search integration
  - Normalized third-party reviews preserving original publisher ratings and canonical URLs
  - Multi-dimensional evidence classification (`supporting`, `contradicting`, `contextual`, `unclassified`)
  - Automated canonical URL deduplication and tracking parameter stripping
  - Interactive Evidence Discovery UI with expandable metadata and source links

- **Enterprise Security & Governance**
  - Supabase PostgreSQL with strict Row Level Security (RLS) policies
  - Server-enforced role-based access control (`user` and `admin`)
  - Moderator review workspace with audit logging for all moderation decisions
  - Strict server-side secret isolation (API keys are never bundled into client code)

## Getting Started

### 1. Prerequisites

- Node.js 18+ (tested on Node.js v22)
- Supabase project
- Google AI Studio API key (for Gemini)
- Google Cloud API key (with Fact Check Tools API enabled)

### 2. Environment Setup

Copy `.env.local.example` to `.env.local`:

```bash
cp .env.local.example .env.local
```

Fill in your configuration in `.env.local`:

```env
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here

# Google Gemini API Configuration (Server-Side Only)
GEMINI_API_KEY=your-gemini-api-key-here
GEMINI_MODEL=gemini-2.5-flash

# Google Fact Check Tools API Configuration (Server-Side Only)
GOOGLE_FACTCHECK_API_KEY=your-google-factcheck-api-key-here
```

### 3. Database Migrations

Apply the SQL files in your Supabase SQL Editor:
- `supabase/schema.sql`
- `supabase/migrations/20261125_day2_audit_hardening.sql`
- `supabase/migrations/20261126_day3_claim_extraction.sql`
- `supabase/migrations/20261126_day4_evidence_retrieval.sql`

### 4. Run Development Server

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser.

### 5. Build & Test

```bash
npm run lint
npm run build
```

## Security

- All API keys (`GEMINI_API_KEY`, `GOOGLE_FACTCHECK_API_KEY`) are kept strictly server-side (`server-only`).
- User role checks and ownership validations are performed on the server.
- Database operations are protected with Supabase Row Level Security (RLS).
- Private uploaded images are accessed exclusively via authenticated, short-lived signed URLs.
