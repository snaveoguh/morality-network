import { NextResponse } from "next/server";
import { fetchStumbleContent, getRandomStumbleItem } from "@/lib/stumble";

export const revalidate = 0; // always fresh for randomness

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get("mode"); // "single" | "batch"

  try {
    if (mode === "single") {
      const item = await getRandomStumbleItem();
      if (!item) {
        return NextResponse.json(
          { error: "No content available" },
          { status: 404 }
        );
      }
      return NextResponse.json(item);
    }

    // Default: batch of shuffled content
    const items = await fetchStumbleContent();
    return NextResponse.json(items);
  } catch (error) {
    console.error("Stumble API error:", error);
    return NextResponse.json(
      { error: "Failed to fetch stumble content" },
      { status: 500 }
    );
  }
}
