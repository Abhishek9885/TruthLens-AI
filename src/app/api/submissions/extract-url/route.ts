import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { extractUrlRequestSchema } from "@/lib/validation/submission";
import { extractArticleFromUrl } from "@/lib/extract/url";

export async function POST(request: Request) {
  const auth = await getAuthContext();
  if (!auth) {
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON request body." },
      { status: 400 }
    );
  }

  const parsed = extractUrlRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: parsed.error.issues[0]?.message ?? "Invalid URL.",
        issues: parsed.error.issues,
      },
      { status: 400 }
    );
  }

  const result = await extractArticleFromUrl(parsed.data.url);

  if (result.blockedByPolicy) {
    return NextResponse.json(
      {
        error: result.extractionError ?? "Target URL is blocked by security policy.",
        blocked: true,
      },
      { status: 400 }
    );
  }

  return NextResponse.json(result, { status: 200 });
}
