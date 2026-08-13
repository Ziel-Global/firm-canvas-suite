import { useState, useEffect, useRef } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  Search,
  Briefcase,
  User,
  ChevronRight,
  Command,
} from "lucide-react";
import { useDebounce } from "@/hooks/use-debounce";
import { cn } from "@/lib/utils";
import {
  performSmartSearch,
  type SmartSearchResult,
} from "@/lib/search.functions";
import { PremiumLoader } from "@/components/premium-loader";

export function SmartSearchBar() {
  const [query, setQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [results, setResults] = useState<SmartSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const debouncedQuery = useDebounce(query, 300);
  const runSearch = useServerFn(performSmartSearch);

  useEffect(() => {
    async function doSearch() {
      if (!debouncedQuery.trim()) {
        setResults([]);
        setIsSearching(false);
        return;
      }
      setIsSearching(true);
      try {
        const data = await runSearch({ data: { query: debouncedQuery } });
        setResults(data);
      } catch (err) {
        console.error("Search failed", err);
        setResults([]);
      } finally {
        setIsSearching(false);
      }
    }
    doSearch();
  }, [debouncedQuery, runSearch]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        wrapperRef.current &&
        !wrapperRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div ref={wrapperRef} className="relative w-full max-w-xl">
      <div className="group relative w-full">
        <Search
          className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground transition-colors group-focus-within:text-foreground"
          strokeWidth={1.75}
        />
        <input
          type="search"
          placeholder="Search matters, clients, topics…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            if (!isOpen) setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          className={cn(
            "h-10 w-full rounded-xl border border-white/[0.08] bg-[#17191D]/90 pl-10 pr-16 text-sm font-medium tracking-wide text-foreground",
            "placeholder:text-muted-foreground/70 outline-none transition-all",
            "hover:border-white/15 hover:bg-[#1a1c20]",
            "focus:border-white/20 focus:bg-[#1a1c20] focus:shadow-[0_0_0_3px_rgba(255,255,255,0.04)]",
          )}
        />
        <div className="pointer-events-none absolute right-2.5 top-1/2 flex -translate-y-1/2 items-center gap-1">
          {isSearching ? (
            <PremiumLoader size="sm" className="mr-1" />
          ) : (
            <kbd className="hidden items-center gap-0.5 rounded-md border border-white/[0.08] bg-white/[0.04] px-1.5 py-0.5 font-sans text-[10px] font-medium text-muted-foreground sm:inline-flex">
              <Command className="size-2.5" />K
            </kbd>
          )}
        </div>
      </div>

      {isOpen && query.trim() ? (
        <div className="absolute top-full left-0 right-0 z-50 mt-2 overflow-hidden rounded-xl border border-white/[0.1] bg-[rgba(16,16,18,0.98)] shadow-[0_24px_60px_-20px_rgba(0,0,0,0.75)] backdrop-blur-xl">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent"
          />
          <div className="flex items-center gap-2 border-b border-white/[0.06] px-3.5 py-2.5">
            <span className="text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
              Smart search
            </span>
            {isSearching ? (
              <span className="ml-auto text-[11px] text-muted-foreground">
                Searching…
              </span>
            ) : results.length > 0 ? (
              <span className="ml-auto rounded-md bg-white/[0.06] px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-foreground/80">
                {results.length}
              </span>
            ) : null}
          </div>

          <div className="max-h-[400px] overflow-y-auto p-1.5">
            {!isSearching && results.length === 0 ? (
              <div className="px-3 py-8 text-center text-sm text-muted-foreground">
                No matching matters for your query.
              </div>
            ) : (
              results.map((res) => (
                <Link
                  key={res.id}
                  to="/cases/$caseId"
                  params={{ caseId: res.id }}
                  onClick={() => setIsOpen(false)}
                  className="group flex w-full items-start gap-3 rounded-lg p-2.5 text-left transition-colors hover:bg-white/[0.05]"
                >
                  <div className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.04] text-muted-foreground">
                    <Briefcase className="size-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-sm font-semibold tracking-tight text-foreground">
                        {res.title}
                      </p>
                      <span className="shrink-0 rounded-md bg-white/[0.06] px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-foreground/80">
                        {Math.round(res.relevance * 100)}%
                      </span>
                    </div>
                    <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
                      <span className="truncate">{res.case_type}</span>
                      <span className="inline-flex items-center gap-1 truncate">
                        <User className="size-3" />
                        {res.client_name}
                      </span>
                    </div>
                  </div>
                  <ChevronRight className="mt-2 size-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                </Link>
              ))
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
