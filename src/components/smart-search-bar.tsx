import { useState, useEffect, useRef } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Search, Sparkles, Loader2, Briefcase, User, ChevronRight } from "lucide-react";
import { useDebounce } from "@/hooks/use-debounce";
import { cn } from "@/lib/utils";
import { performSmartSearch, type SmartSearchResult } from "@/lib/search.functions";

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

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div ref={wrapperRef} className="relative w-full">
      <div className="relative w-full group">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground group-focus-within:text-tag-blue transition-colors" strokeWidth={1.75} />
        <input
          type="search"
          placeholder="Smart search: 'land dispute involving Malik...'"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            if (!isOpen) setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          className="h-9 w-full rounded-control bg-frame pl-9 pr-10 text-sm text-foreground placeholder:text-muted-foreground outline-none ring-1 ring-transparent transition-all focus:bg-surface focus:ring-tag-blue/50 focus:ring-2"
        />
        <div className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-muted-foreground opacity-50">
          <Sparkles className="size-4" />
        </div>
      </div>

      {isOpen && query.trim() && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-canvas border border-border rounded-[var(--radius-control)] shadow-xl z-50 overflow-hidden flex flex-col max-h-[400px]">
          <div className="px-3 py-2 bg-muted/30 border-b border-border flex items-center gap-2 text-xs text-muted-foreground">
            <Sparkles className="size-3 text-tag-blue" />
            <span>AI Intent Search</span>
            {isSearching && <Loader2 className="size-3 animate-spin ml-auto" />}
          </div>
          
          <div className="overflow-y-auto p-1">
            {!isSearching && results.length === 0 ? (
              <div className="p-4 text-center text-sm text-muted-foreground">
                No matching cases found for your query.
              </div>
            ) : (
              results.map((res) => (
                <Link
                  key={res.id}
                  to="/cases/$caseId"
                  params={{ caseId: res.id }}
                  onClick={() => setIsOpen(false)}
                  className="flex items-start gap-3 p-2 hover:bg-muted/50 rounded-md transition-colors text-left w-full group"
                >
                  <div className="mt-0.5 size-8 shrink-0 rounded-full bg-tag-blue/10 text-tag-blue flex items-center justify-center">
                    <Briefcase className="size-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium text-foreground truncate">{res.title}</p>
                      <span className="text-[10px] font-medium text-tag-green bg-tag-green/10 px-1.5 py-0.5 rounded shrink-0">
                        {Math.round(res.relevance * 100)}% match
                      </span>
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                      <span className="truncate">{res.case_type}</span>
                      <span className="flex items-center gap-1 truncate">
                        <User className="size-3" />
                        {res.client_name}
                      </span>
                    </div>
                  </div>
                  <ChevronRight className="size-4 text-muted-foreground mt-2 opacity-0 group-hover:opacity-100 transition-opacity" />
                </Link>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
