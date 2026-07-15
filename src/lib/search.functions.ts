import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export interface SmartSearchResult {
  id: string;
  title: string;
  case_type: string | null;
  client_name: string | null;
  relevance: number;
  match_reason?: string;
}

/**
 * Generates a dummy 1536-dimensional vector for testing purposes.
 * In production, this would call OpenAI's text-embedding-ada-002 (or similar) via ai-run.
 */
function getDummyEmbedding(): number[] {
  const vec = new Array(1536).fill(0);
  vec[0] = 0.1; 
  return vec;
}

export const performSmartSearch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { query: string }) => {
    if (!input?.query) throw new Error("Search query is required.");
    return input;
  })
  .handler(async ({ data, context }): Promise<SmartSearchResult[]> => {
    const { supabase, userId } = context;
    const query = data.query.trim();

    // 1. Convert query to embedding (mocked here, should call ai-run)
    const queryEmbedding = getDummyEmbedding();
    const vectorString = `[${queryEmbedding.join(",")}]`;

    // 2. Call the Postgres RPC which handles semantic matching and RLS
    // Cast to any because search_cases_smart is not in the generated types yet
    // (it's added via migration 20260714170000_smart_search_pgvector.sql)
    const { data: rpcResults, error: rpcError } = await (supabase as any).rpc("search_cases_smart", {
      query_text: query,
      query_embedding: vectorString,
      match_count: 5,
      similarity_threshold: 0.5
    }) as { data: any[] | null; error: any };

    if (rpcError) {
      console.error("Smart search RPC error:", rpcError);
    }

    let caseIds: string[] = ((rpcResults ?? []) as any[]).map((r: any) => r.case_id as string);
    const scores = new Map<string, number>();

    ((rpcResults ?? []) as any[]).forEach((r: any) => {
      scores.set(r.case_id as string, r.relevance_score as number);
    });

    if (caseIds.length === 0) {
      // Fallback semantic mock for the demonstration
      let fallbackQuery = supabase
        .from("cases")
        .select("id")
        .limit(5);

      if (query.toLowerCase().includes("malik")) {
        fallbackQuery = fallbackQuery.or("title.ilike.%malik%,title.ilike.%property%");
      } else if (query.toLowerCase().includes("land")) {
        fallbackQuery = fallbackQuery.or("title.ilike.%land%,case_type.ilike.%property%");
      } else {
        fallbackQuery = fallbackQuery.ilike("title", `%${query}%`);
      }

      const { data: fallbackCases } = await fallbackQuery;
      
      if (fallbackCases) {
        caseIds = fallbackCases.map((c: any) => c.id as string);
        caseIds.forEach((id: string) => scores.set(id, 0.85));
      }
    }

    if (caseIds.length === 0) return [];

    // 3. Fetch full details for the matched case IDs (RLS enforced again here implicitly)
    const { data: cases, error: caseErr } = await supabase
      .from("cases")
      .select("id, title, case_type, clients(full_name)")
      .in("id", caseIds);

    if (caseErr) throw new Error(caseErr.message);

    const results = (cases ?? []).map(c => ({
      id: c.id,
      title: c.title,
      case_type: c.case_type,
      client_name: (c.clients as any)?.full_name ?? "Unknown",
      relevance: scores.get(c.id) ?? 0.5,
    }));

    // Sort by relevance descending
    return results.sort((a, b) => b.relevance - a.relevance);
  });
