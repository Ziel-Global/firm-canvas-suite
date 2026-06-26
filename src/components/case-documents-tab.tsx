import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Folder, FolderOpen, FileText, Lock, Upload } from "lucide-react";
import { toast } from "sonner";

import {
  getCaseFolders,
  getFolderDocuments,
  uploadDocument,
  type CaseDocument,
} from "@/lib/documents.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tag } from "@/components/ui/tag";
import { Pill } from "@/components/ui/pill";
import { cn } from "@/lib/utils";

const ACCEPT = ".pdf,.docx,.xlsx,.jpg,.jpeg,.png";


function formatDate(value: string) {
  return new Date(value).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function CaseDocumentsTab({ caseId }: { caseId: string }) {
  const fetchFolders = useServerFn(getCaseFolders);
  const fetchDocs = useServerFn(getFolderDocuments);
  const upload = useServerFn(uploadDocument);
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);

  async function handleFile(file: File) {
    if (!selectedFolderId) return;
    setUploading(true);
    const form = new FormData();
    form.append("caseId", caseId);
    form.append("folderId", selectedFolderId);
    form.append("file", file);
    try {
      await upload({ data: form });
      toast.success("Document uploaded");
      queryClient.invalidateQueries({
        queryKey: ["folder-documents", caseId, selectedFolderId],
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }


  const { data: folders, isLoading: foldersLoading } = useQuery({
    queryKey: ["case-folders", caseId],
    queryFn: () => fetchFolders({ data: { caseId } }),
  });

  // Default-select the first accessible folder.
  useEffect(() => {
    if (!selectedFolderId && folders && folders.length > 0) {
      setSelectedFolderId(folders[0].id);
    }
  }, [folders, selectedFolderId]);

  const { data: documents, isLoading: docsLoading } = useQuery({
    queryKey: ["folder-documents", caseId, selectedFolderId],
    queryFn: () =>
      fetchDocs({ data: { caseId, folderId: selectedFolderId as string } }),
    enabled: Boolean(selectedFolderId),
  });

  if (foldersLoading) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        Loading documents…
      </p>
    );
  }

  if (!folders || folders.length === 0) {
    return (
      <Card className="p-6">
        <p className="text-sm text-muted-foreground">
          You do not have access to any document folders for this case.
        </p>
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-[16rem_1fr]">
      {/* Folder tree */}
      <Card className="h-fit p-2">
        <nav className="space-y-0.5">
          {folders.map((folder) => {
            const active = folder.id === selectedFolderId;
            const Icon = active ? FolderOpen : Folder;
            return (
              <button
                key={folder.id}
                type="button"
                onClick={() => setSelectedFolderId(folder.id)}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-[var(--radius-control)] px-3 py-2 text-left text-sm transition-colors",
                  active
                    ? "bg-frame font-medium text-foreground"
                    : "text-muted-foreground hover:bg-frame/60 hover:text-foreground",
                )}
              >
                <Icon className="size-4 shrink-0" />
                <span className="truncate">{folder.name}</span>
              </button>
            );
          })}
        </nav>
      </Card>

      {/* Document list */}
      <div className="min-w-0 space-y-3">
        <div className="flex items-center justify-end">
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPT}
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleFile(file);
              e.target.value = "";
            }}
          />
          <Button
            variant="default"
            disabled={!selectedFolderId || uploading}
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="size-4" />
            {uploading ? "Uploading…" : "Upload document"}
          </Button>
        </div>

        {docsLoading && (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Loading files…
          </p>
        )}


        {!docsLoading && documents && documents.length === 0 && (
          <Card className="p-6">
            <p className="text-sm text-muted-foreground">
              This folder is empty.
            </p>
          </Card>
        )}

        {!docsLoading && documents && documents.length > 0 && (
          <Card className="overflow-hidden p-0">
            <ul className="divide-y divide-border">
              {documents.map((doc) => (
                <DocumentRow key={doc.id} doc={doc} />
              ))}
            </ul>
          </Card>
        )}
      </div>
    </div>
  );
}

function DocumentRow({ doc }: { doc: CaseDocument }) {
  return (
    <li className="flex items-start gap-3 px-4 py-3">
      <FileText className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate text-sm font-medium text-foreground">
            {doc.title}
          </span>
          {doc.is_locked && (
            <Pill className="bg-priority-high/20 text-foreground">
              <Lock className="size-3" />
              Locked
            </Pill>
          )}
          {doc.is_archived && (
            <Pill className="bg-frame text-muted-foreground">Archived</Pill>
          )}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          {doc.doc_type && <Tag color="blue">{doc.doc_type}</Tag>}
          <span>v{doc.current_version ?? 1}</span>
          <span>·</span>
          <span>{doc.uploader_name ?? "Unknown"}</span>
          <span>·</span>
          <span>{formatDate(doc.created_at)}</span>
        </div>
      </div>
    </li>
  );
}
