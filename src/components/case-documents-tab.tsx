import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Folder, FolderOpen, FileText, Lock, Upload, Bot, Loader2, Search, X, Share2, Eye, Download } from "lucide-react";
import { toast } from "sonner";

import {
  getCaseFolders,
  getDocumentVersions,
  getFolderDocuments,
  getDocumentViewUrl,
  restoreDocumentVersion,
  uploadDocument,
  submitForApproval,
  shareDocumentWithClient,
  unshareDocumentWithClient,
  type CaseDocument,
  type DocumentVersionRow,
} from "@/lib/documents.functions";
import { useAuth } from "@/contexts/auth-context";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tag } from "@/components/ui/tag";
import { Pill } from "@/components/ui/pill";
import { GenerateAIDocumentModal } from "@/components/generate-ai-document-modal";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

const ACCEPT = ".pdf,.docx,.xlsx,.jpg,.jpeg,.png";

type FolderRole =
  "super_admin" | "admin" | "senior_lawyer" | "junior_lawyer" | "support" | "client" | null;

const READABLE_FOLDER_CODES: Record<Exclude<FolderRole, null>, readonly string[]> = {
  super_admin: ["01", "02", "03", "04", "05", "06", "07"],
  admin: ["01", "02", "03", "04", "05", "06"],
  senior_lawyer: ["01", "02", "03", "04", "05", "06"],
  junior_lawyer: ["03", "06"],
  support: ["01", "02", "03", "04", "05", "06"],
  client: [],
};

const WRITABLE_FOLDER_CODES: Record<Exclude<FolderRole, null>, readonly string[]> = {
  super_admin: ["01", "02", "03", "04", "05", "06", "07"],
  admin: ["01", "02", "03", "04", "05", "06"],
  senior_lawyer: ["02", "03"],
  junior_lawyer: ["03"],
  support: [],
  client: [],
};

function canReadFolder(role: FolderRole, code: string) {
  if (!role) return false;
  return READABLE_FOLDER_CODES[role].includes(code);
}

function canUploadToFolder(role: FolderRole, code: string) {
  if (!role) return false;
  return WRITABLE_FOLDER_CODES[role].includes(code);
}

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
  const fetchVersions = useServerFn(getDocumentVersions);
  const fetchViewUrl = useServerFn(getDocumentViewUrl);
  const upload = useServerFn(uploadDocument);
  const submitDoc = useServerFn(submitForApproval);
  const shareWithClient = useServerFn(shareDocumentWithClient);
  const unshareWithClient = useServerFn(unshareDocumentWithClient);
  const restoreVersion = useServerFn(restoreDocumentVersion);
  const { role } = useAuth();
  const canManageVersions = role === "super_admin";
  const canShareWithClient = role === "super_admin" || role === "admin";
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const versionFileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [versionUploading, setVersionUploading] = useState(false);
  const [shareBusy, setShareBusy] = useState(false);
  const [viewBusyId, setViewBusyId] = useState<string | null>(null);
  const [aiModalOpen, setAiModalOpen] = useState(false);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [selectedDocumentId, setSelectedDocumentId] = useState<string | null>(null);
  const [versionNote, setVersionNote] = useState("");

  async function openDocument(
    documentId: string,
    options?: { versionId?: string; download?: boolean },
  ) {
    const busyKey = options?.versionId ?? documentId;
    setViewBusyId(busyKey);
    try {
      const result = await fetchViewUrl({
        data: {
          caseId,
          documentId,
          versionId: options?.versionId ?? null,
        },
      });
      if (options?.download) {
        const a = document.createElement("a");
        a.href = result.url;
        a.download = result.fileName;
        a.rel = "noopener";
        a.target = "_blank";
        document.body.appendChild(a);
        a.click();
        a.remove();
      } else {
        window.open(result.url, "_blank", "noopener,noreferrer");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not open document");
    } finally {
      setViewBusyId(null);
    }
  }

  async function handleFile(file: File) {
    if (!selectedFolderId || !selectedFolder || !canUploadSelectedFolder) return;
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
      queryClient.invalidateQueries({ queryKey: ["global-documents"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function handleSubmit(documentId: string) {
    try {
      toast.loading("Running AI Proofreader...", { id: "ai-proofread" });
      await new Promise(resolve => setTimeout(resolve, 2000));
      toast.success("AI Proofreader complete. No major issues found.", { id: "ai-proofread" });

      await submitDoc({ data: { documentId } });
      toast.success("Submitted for approval");
      queryClient.invalidateQueries({ queryKey: ["folder-documents", caseId, selectedFolderId] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to submit", { id: "ai-proofread" });
    }
  }

  async function handleToggleClientShare(documentId: string, currentlyShared: boolean) {
    setShareBusy(true);
    try {
      if (currentlyShared) {
        const result = await unshareWithClient({ data: { documentId } });
        toast.success(`Removed from ${result.clientName}'s portal`);
      } else {
        const result = await shareWithClient({ data: { documentId } });
        toast.success(`Shared with ${result.clientName} in the portal`);
      }
      queryClient.invalidateQueries({
        queryKey: ["folder-documents", caseId, selectedFolderId],
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Share update failed");
    } finally {
      setShareBusy(false);
    }
  }

  async function handleVersionFile(file: File) {
    const selectedDocument = documents?.find((doc) => doc.id === selectedDocumentId);
    if (!selectedDocument || !selectedFolderId) return;
    setVersionUploading(true);
    const form = new FormData();
    form.append("caseId", caseId);
    form.append("folderId", selectedFolderId);
    form.append("documentId", selectedDocument.id);
    form.append("file", file);
    if (versionNote.trim()) form.append("note", versionNote.trim());
    try {
      await upload({ data: form });
      toast.success("New version uploaded");
      setVersionNote("");
      queryClient.invalidateQueries({ queryKey: ["folder-documents", caseId, selectedFolderId] });
      queryClient.invalidateQueries({
        queryKey: ["document-versions", caseId, selectedDocument.id],
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setVersionUploading(false);
    }
  }

  const { data: folders, isLoading: foldersLoading } = useQuery({
    queryKey: ["case-folders", caseId],
    queryFn: () => fetchFolders({ data: { caseId } }),
  });

  useEffect(() => {
    if (!selectedFolderId && folders && folders.length > 0) {
      setSelectedFolderId(folders[0].id);
    }
  }, [folders, selectedFolderId]);

  const { data: documents, isLoading: docsLoading } = useQuery({
    queryKey: ["folder-documents", caseId, selectedFolderId],
    queryFn: () => fetchDocs({ data: { caseId, folderId: selectedFolderId as string } }),
    enabled: Boolean(selectedFolderId),
  });

  useEffect(() => {
    if (!documents || documents.length === 0) {
      setSelectedDocumentId(null);
      return;
    }
    setSelectedDocumentId((prev) => {
      if (prev && documents.some((doc) => doc.id === prev)) return prev;
      return documents[0].id;
    });
  }, [documents]);

  const selectedDocument =
    documents?.find((doc) => doc.id === selectedDocumentId) ?? documents?.[0] ?? null;
  const selectedFolder = folders?.find((folder) => folder.id === selectedFolderId) ?? null;
  const canUploadSelectedFolder = canUploadToFolder(role, selectedFolder?.code ?? "");

  const { data: versions, isLoading: versionsLoading } = useQuery({
    queryKey: ["document-versions", caseId, selectedDocumentId],
    queryFn: () => fetchVersions({ data: { caseId, documentId: selectedDocumentId as string } }),
    enabled: Boolean(canManageVersions && selectedDocumentId),
  });

  if (foldersLoading) {
    return <p className="py-8 text-center text-sm text-muted-foreground">Loading documents…</p>;
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
      <GenerateAIDocumentModal open={aiModalOpen} onOpenChange={setAiModalOpen} caseId={caseId} />
      
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

      <div className="min-w-0 space-y-3">
        <div className="flex items-center justify-end gap-2">
          {selectedFolder && canUploadSelectedFolder ? (
            <>
              <Button
                variant="outline"
                className="text-tag-blue border-tag-blue/30 hover:bg-tag-blue/10"
                onClick={() => setAiModalOpen(true)}
              >
                <Bot className="size-4 mr-1.5" />
                Generate with AI
              </Button>
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
                {uploading ? "Uploading…" : `Upload to ${selectedFolder.name}`}
              </Button>
            </>
          ) : selectedFolder ? (
            <p className="text-sm text-muted-foreground">
              Uploads are not available in this folder.
            </p>
          ) : null}
        </div>

        {docsLoading && (
          <p className="py-8 text-center text-sm text-muted-foreground">Loading files…</p>
        )}

        {!docsLoading && documents && documents.length === 0 && (
          <Card className="p-6">
            <p className="text-sm text-muted-foreground">This folder is empty.</p>
          </Card>
        )}

        {!docsLoading && documents && documents.length > 0 && (
          <Card className="overflow-hidden p-0">
            <ul className="divide-y divide-border">
              {documents.map((doc) => (
                <DocumentRow
                  key={doc.id}
                  doc={doc}
                  selected={doc.id === selectedDocumentId}
                  onSelect={() => setSelectedDocumentId(doc.id)}
                />
              ))}
            </ul>
          </Card>
        )}

        {selectedDocument && (
          <div className="space-y-4 mt-6">
            <Card className="p-5 flex flex-col gap-4 border-l-4 border-l-tag-blue">
              <div className="flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-start">
                <div>
                  <h3 className="text-lg font-semibold text-foreground">{selectedDocument.title}</h3>
                  <div className="flex flex-wrap items-center gap-2 mt-1">
                    <span className="text-sm text-muted-foreground">Status:</span>
                    <Pill className={
                      selectedDocument.approval_status === "approved" ? "bg-tag-blue text-white" :
                      selectedDocument.approval_status === "in_review" ? "bg-amber-500/20 text-amber-600" :
                      "bg-muted text-muted-foreground"
                    }>
                      {selectedDocument.approval_status === "approved" ? "Approved" :
                       selectedDocument.approval_status === "in_review" ? "In Review" : "Draft"}
                    </Pill>
                    {selectedDocument.shared_with_client ? (
                      <Pill className="bg-status-ontrack/20 text-status-ontrack">
                        <Share2 className="size-3" />
                        Shared with client
                      </Pill>
                    ) : null}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    disabled={viewBusyId === selectedDocument.id}
                    onClick={() => void openDocument(selectedDocument.id)}
                    className="border-white/15 bg-white/[0.03]"
                  >
                    {viewBusyId === selectedDocument.id ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Eye className="size-4" />
                    )}
                    View
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={viewBusyId === selectedDocument.id}
                    onClick={() =>
                      void openDocument(selectedDocument.id, { download: true })
                    }
                    className="border-white/15 bg-white/[0.03]"
                  >
                    <Download className="size-4" />
                    Download
                  </Button>
                  {canShareWithClient ? (
                    <Button
                      type="button"
                      variant={selectedDocument.shared_with_client ? "outline" : "default"}
                      disabled={shareBusy}
                      onClick={() =>
                        void handleToggleClientShare(
                          selectedDocument.id,
                          selectedDocument.shared_with_client,
                        )
                      }
                      className={
                        selectedDocument.shared_with_client
                          ? "border-white/15 bg-white/[0.03]"
                          : "bg-gradient-to-b from-[#F8F8F8] to-[#CFCFCF] text-[#1a1c20] hover:from-white hover:to-[#d8d8d8]"
                      }
                    >
                      {shareBusy ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <Share2 className="size-4" />
                      )}
                      {selectedDocument.shared_with_client
                        ? "Unshare from client"
                        : "Share with client"}
                    </Button>
                  ) : null}
                  {selectedDocument.approval_status === "draft" && !selectedDocument.is_locked && (
                    <Button onClick={() => handleSubmit(selectedDocument.id)} className="bg-tag-blue hover:bg-tag-blue/90">
                      <Bot className="size-4 mr-2" />
                      Submit for Approval
                    </Button>
                  )}
                </div>
              </div>
            </Card>

            {canManageVersions && (
              <VersionHistoryPanel
                caseId={caseId}
                document={selectedDocument}
                versions={versions ?? []}
                versionsLoading={versionsLoading}
                versionFileInputRef={versionFileInputRef}
                versionNote={versionNote}
                versionUploading={versionUploading}
                viewBusyId={viewBusyId}
                onNoteChange={setVersionNote}
                onUploadClick={() => versionFileInputRef.current?.click()}
                onUploadFile={handleVersionFile}
                onViewVersion={(versionId) =>
                  void openDocument(selectedDocument.id, { versionId })
                }
                onRestore={async (versionId) => {
                  try {
                    await restoreVersion({
                      data: { caseId, documentId: selectedDocument.id, versionId },
                    });
                    toast.success("Version restored");
                    queryClient.invalidateQueries({
                      queryKey: ["folder-documents", caseId, selectedFolderId],
                    });
                    queryClient.invalidateQueries({
                      queryKey: ["document-versions", caseId, selectedDocument.id],
                    });
                  } catch (err) {
                    toast.error(err instanceof Error ? err.message : "Restore failed");
                  }
                }}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function DocumentRow({
  doc,
  selected,
  onSelect,
}: {
  doc: CaseDocument;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        className={cn(
          "flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-frame/50",
          selected && "bg-frame/60",
        )}
      >
        <FileText className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate text-sm font-medium text-foreground">{doc.title}</span>
            {doc.is_locked && (
              <Pill className="bg-priority-high/20 text-foreground">
                <Lock className="size-3" />
                Locked
              </Pill>
            )}
            {doc.is_archived && <Pill className="bg-frame text-muted-foreground">Archived</Pill>}
            {doc.shared_with_client && (
              <Pill className="bg-status-ontrack/20 text-status-ontrack">
                <Share2 className="size-3" />
                Client
              </Pill>
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
      </button>
    </li>
  );
}

function VersionHistoryPanel({
  caseId,
  document,
  versions,
  versionsLoading,
  versionFileInputRef,
  versionNote,
  versionUploading,
  viewBusyId,
  onNoteChange,
  onUploadClick,
  onUploadFile,
  onViewVersion,
  onRestore,
}: {
  caseId: string;
  document: CaseDocument;
  versions: DocumentVersionRow[];
  versionsLoading: boolean;
  versionFileInputRef: React.RefObject<HTMLInputElement | null>;
  versionNote: string;
  versionUploading: boolean;
  viewBusyId: string | null;
  onNoteChange: (value: string) => void;
  onUploadClick: () => void;
  onUploadFile: (file: File) => Promise<void>;
  onViewVersion: (versionId: string) => void;
  onRestore: (versionId: string) => Promise<void>;
}) {
  return (
    <Card className="space-y-4 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-foreground">Version history</h3>
          <p className="text-sm text-muted-foreground">
            {document.title} · current version {document.current_version ?? 1}
          </p>
        </div>
        <Pill className="bg-tag-blue/40 text-foreground">Super Admin</Pill>
      </div>

      <input
        ref={versionFileInputRef}
        type="file"
        accept={ACCEPT}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void onUploadFile(file);
          e.target.value = "";
        }}
      />

      <div className="space-y-3 rounded-card border border-border bg-frame/40 p-4">
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">
            Optional note for the new version
          </label>
          <Textarea
            value={versionNote}
            onChange={(e) => onNoteChange(e.target.value)}
            placeholder="Explain what changed in this version…"
            rows={3}
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="default" onClick={onUploadClick} disabled={versionUploading}>
            <Upload className="size-4" />
            {versionUploading ? "Uploading…" : "Upload new version"}
          </Button>
        </div>
      </div>

      {versionsLoading ? (
        <p className="text-sm text-muted-foreground">Loading version history…</p>
      ) : versions.length === 0 ? (
        <p className="text-sm text-muted-foreground">No version history found.</p>
      ) : (
        <ul className="space-y-3">
          {versions.map((version) => (
            <li key={version.id} className="rounded-card border border-border p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-foreground">
                      Version {version.version_number}
                    </span>
                    {version.is_current && (
                      <Pill className="bg-priority-high/20 text-foreground">Current</Pill>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {version.uploader_name ?? "Unknown"} · {formatDate(version.uploaded_at)}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={viewBusyId === version.id || !version.file_path}
                    onClick={() => onViewVersion(version.id)}
                  >
                    {viewBusyId === version.id ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <Eye className="size-3.5" />
                    )}
                    View
                  </Button>
                  {!version.is_current && (
                    <Button variant="ghost" size="sm" onClick={() => void onRestore(version.id)}>
                      Restore
                    </Button>
                  )}
                </div>
              </div>
              {version.note && (
                <p className="mt-3 whitespace-pre-wrap text-sm text-muted-foreground">
                  {version.note}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
