import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Sparkles, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

import { cleanupDictation } from "@/lib/ai.functions";

interface CleanupButtonProps {
  text: string;
  onCleaned: (cleanedText: string) => void;
  className?: string;
}

export function CleanupButton({ text, onCleaned, className }: CleanupButtonProps) {
  const [cleaning, setCleaning] = useState(false);
  const runCleanup = useServerFn(cleanupDictation);

  async function handleCleanup() {
    if (!text.trim()) return;
    setCleaning(true);
    toast.loading("Cleaning up text…", { id: "cleanup" });
    try {
      const result = await runCleanup({ data: { text: text.trim() } });
      onCleaned(result.cleaned);
      toast.success("Text cleaned and structured.", { id: "cleanup" });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Cleanup failed", { id: "cleanup" });
    } finally {
      setCleaning(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleCleanup}
      disabled={cleaning || !text.trim()}
      title="Clean up dictation (fixes punctuation, removes filler words)"
      className={cn(
        "inline-flex items-center justify-center rounded-full transition-all",
        "size-8 text-muted-foreground hover:text-tag-blue hover:bg-tag-blue/10",
        (!text.trim() || cleaning) && "opacity-40 cursor-not-allowed hover:bg-transparent hover:text-muted-foreground",
        className,
      )}
    >
      {cleaning ? (
        <Loader2 className="size-4 animate-spin text-tag-blue" />
      ) : (
        <Sparkles className="size-4" />
      )}
    </button>
  );
}
