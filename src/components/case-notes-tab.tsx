import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Lock, Mic, Send } from "lucide-react";

import { addCaseNote, getCaseNotes } from "@/lib/cases.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Pill } from "@/components/ui/pill";

function formatTimestamp(value: string) {
  return new Date(value).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function CaseNotesTab({
  caseId,
  role,
}: {
  caseId: string;
  role: string | null;
}) {
  const queryClient = useQueryClient();
  const fetchNotes = useServerFn(getCaseNotes);
  const submitNote = useServerFn(addCaseNote);

  const [body, setBody] = useState("");
  const [principalOnly, setPrincipalOnly] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const isSuperAdmin = role === "super_admin";
  const canAdd =
    role != null &&
    ["super_admin", "admin", "senior_lawyer", "junior_lawyer"].includes(role);

  const queryKey = ["case-notes", caseId];
  const { data: notes, isLoading } = useQuery({
    queryKey,
    queryFn: () => fetchNotes({ data: { caseId } }),
  });

  async function handleSubmit() {
    const trimmed = body.trim();
    if (!trimmed) return;
    setSaving(true);
    setErrorMsg(null);
    try {
      await submitNote({
        data: { caseId, body: trimmed, isPrincipalOnly: principalOnly },
      });
      setBody("");
      setPrincipalOnly(false);
      await queryClient.invalidateQueries({ queryKey });
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "Could not save note.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      {canAdd && (
        <Card className="space-y-3 p-4">
          <div className="relative">
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Add a note…"
              rows={3}
              className="w-full resize-none rounded-[var(--radius-control)] border border-border bg-background px-3 py-2 pr-11 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-ring"
            />
            <button
              type="button"
              title="Dictate note (coming soon)"
              aria-label="Dictate note (coming soon)"
              disabled
              className="absolute right-2 top-2 inline-flex size-8 items-center justify-center rounded-full text-muted-foreground opacity-60"
            >
              <Mic className="size-4" />
            </button>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            {isSuperAdmin ? (
              <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-foreground">
                <input
                  type="checkbox"
                  checked={principalOnly}
                  onChange={(e) => setPrincipalOnly(e.target.checked)}
                  className="size-4 rounded border-border accent-primary"
                />
                <span className="inline-flex items-center gap-1">
                  <Lock className="size-3.5" />
                  Principal-only
                </span>
              </label>
            ) : (
              <span />
            )}
            <Button onClick={handleSubmit} disabled={saving || !body.trim()}>
              <Send className="size-4" />
              {saving ? "Saving…" : "Add note"}
            </Button>
          </div>

          {errorMsg && <p className="text-sm text-destructive">{errorMsg}</p>}
        </Card>
      )}

      {isLoading && (
        <p className="text-center text-sm text-muted-foreground">Loading notes…</p>
      )}

      {!isLoading && notes && notes.length === 0 && (
        <Card className="p-6">
          <p className="text-sm text-muted-foreground">No notes yet.</p>
        </Card>
      )}

      <div className="space-y-3">
        {notes?.map((note) => (
          <Card key={note.id} className="space-y-2 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium text-foreground">
                {note.author_name ?? "Unknown"}
              </span>
              <span className="text-xs text-muted-foreground">
                {formatTimestamp(note.created_at)}
              </span>
              {note.is_principal_only && (
                <Pill className="bg-tag-purple/30 text-foreground">
                  <Lock className="size-3" />
                  Principal-only
                </Pill>
              )}
            </div>
            <p className="whitespace-pre-wrap text-sm text-foreground">{note.body}</p>
          </Card>
        ))}
      </div>
    </div>
  );
}
