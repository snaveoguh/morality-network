import { NextResponse } from "next/server";
import { recallAll, countByScope } from "@/lib/agents/core/memory";
import { getKnowledgeStats } from "@/lib/agents/core/knowledge";

export const dynamic = "force-dynamic";

/**
 * GET /api/agents/memory/stats
 *
 * Returns memory statistics: total memories, breakdown by scope,
 * knowledge stats (total facts, sources), and recent memories.
 */
export async function GET() {
  try {
    const [
      knowledgeCount,
      globalCount,
      sourcesCount,
      progressCount,
      knowledgeStats,
      recentMemories,
    ] = await Promise.all([
      countByScope("knowledge"),
      countByScope("global"),
      countByScope("knowledge-sources"),
      countByScope("self-learn-progress"),
      getKnowledgeStats(),
      recallAll(20),
    ]);

    return NextResponse.json({
      totals: {
        knowledge: knowledgeCount,
        global: globalCount,
        sources: sourcesCount,
        progress: progressCount,
        total: knowledgeCount + globalCount + sourcesCount + progressCount,
      },
      knowledgeStats,
      recentMemories: recentMemories.map((m) => ({
        key: m.key,
        scope: m.scope,
        content: m.content.slice(0, 200),
        updatedAt: m.updatedAt,
      })),
      generatedAt: Date.now(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
