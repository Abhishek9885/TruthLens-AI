import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { validateServerImageFile } from "@/lib/validation/submission";
import { extractTextFromImageBuffer } from "@/lib/extract/ocr";

export async function POST(request: Request) {
  const auth = await getAuthContext();
  if (!auth) {
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 }
    );
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "Expected multipart/form-data payload." },
      { status: 400 }
    );
  }

  const validation = await validateServerImageFile(formData.get("image"));
  if (!validation.ok) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }

  const ocr = await extractTextFromImageBuffer(
    Buffer.from(validation.arrayBuffer)
  );
  return NextResponse.json(ocr, { status: 200 });
}
