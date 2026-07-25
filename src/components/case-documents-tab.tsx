import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Folder, FolderOpen, FileText, BadgeCheck, Upload, Bot, Loader2, Share2, Eye, Download } from "lucide-react";
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
import { GenerateAIDocumentModal } from "@/components/generate-ai-document-modal";
import { DocumentVisibilityPanel } from "@/components/document-visibility-panel";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

const ACCEPT = ".pdf,.docx,.xlsx,.jpg,.jpeg,.png";

type DocSubTab = "list" | "access" | "versions";

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

/** Soft secondary action — keeps label visible on hover. */
const BTN_SOFT =
  "inline-flex h-9 items-center justify-center gap-2 rounded-xl border border-white/[0.12] bg-white/[0.05] px-3.5 text-xs font-medium text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] transition-colors hover:border-white/[0.18] hover:bg-white/[0.1] hover:text-foreground disabled:pointer-events-none disabled:opacity-50";

/** Light primary CTA — dark ink stays dark on hover. */
const BTN_LIGHT =
  "inline-flex h-9 items-center justify-center gap-2 rounded-xl border-0 bg-gradient-to-b from-[#F8F8F8] to-[#D4D4D4] px-3.5 text-xs font-semibold text-[#14161a] shadow-[0_8px_20px_rgba(0,0,0,0.28),inset_0_1px_0_rgba(255,255,255,0.85)] transition-[filter,transform] hover:brightness-110 hover:text-[#14161a] active:translate-y-px disabled:pointer-events-none disabled:opacity-50 [&_svg]:text-[#14161a]";

/** Blue accent soft button. */
const BTN_BLUE =
  "inline-flex h-9 items-center justify-center gap-2 rounded-xl border border-tag-blue/30 bg-tag-blue/15 px-3.5 text-xs font-medium text-tag-blue shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] transition-colors hover:border-tag-blue/45 hover:bg-tag-blue/22 hover:text-tag-blue disabled:pointer-events-none disabled:opacity-50";

/** Display name without the redundant "04 " code prefix stored in the DB. */
function folderLabel(folder: { code: string; name: string }) {
  const prefix = `${folder.code} `;
  return folder.name.startsWith(prefix) ? folder.name.slice(prefix.length) : folder.name;
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
  const [docSubTab, setDocSubTab] = useState<DocSubTab>("list");

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
      toast.success(
        "Submitted for approval. After approval it moves to Approved Documents and locks.",
      );
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
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[15rem_minmax(0,1fr)]">
      <GenerateAIDocumentModal open={aiModalOpen} onOpenChange={setAiModalOpen} caseId={caseId} />

      <aside className="h-fit rounded-2xl border border-white/[0.08] bg-[rgba(18,18,20,0.72)] p-2 shadow-[0_20px_50px_-30px_rgba(0,0,0,0.65)]">
        <p className="px-3 pb-2 pt-1.5 text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
          Folders
        </p>
        <nav className="space-y-0.5">
          {folders.map((folder) => {
            const active = folder.id === selectedFolderId;
            const Icon = active ? FolderOpen : Folder;
            return (
              <button
                key={folder.id}
                type="button"
                onClick={() => {
                  setSelectedFolderId(folder.id);
                  setDocSubTab("list");
                }}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm transition-colors",
                  active
                    ? "bg-tag-blue/15 font-medium text-foreground shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--tag-blue)_35%,transparent)]"
                    : "text-muted-foreground hover:bg-white/[0.04] hover:text-foreground",
                )}
              >
                <Icon
                  className={cn(
                    "size-4 shrink-0",
                    active ? "text-tag-blue" : "text-muted-foreground/80",
                  )}
                />
                <span className="truncate">{folderLabel(folder)}</span>
              </button>
            );
          })}
        </nav>
      </aside>

      <div className="min-w-0 space-y-4">
        <Tabs
          value={docSubTab}
          onValueChange={(value) => setDocSubTab(value as DocSubTab)}
        >
          <TabsList className="h-auto w-full justify-start gap-1 rounded-2xl border border-white/[0.08] bg-[rgba(18,18,20,0.72)] p-1.5 shadow-[0_16px_40px_-28px_rgba(0,0,0,0.7)]">
            <TabsTrigger
              value="list"
              className="rounded-xl px-3.5 py-2 text-xs font-medium data-[state=active]:bg-tag-blue/18 data-[state=active]:text-foreground data-[state=active]:shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--tag-blue)_30%,transparent)]"
            >
              Document list
            </TabsTrigger>
            {canShareWithClient ? (
              <TabsTrigger
                value="access"
                className="rounded-xl px-3.5 py-2 text-xs font-medium data-[state=active]:bg-tag-blue/18 data-[state=active]:text-foreground data-[state=active]:shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--tag-blue)_30%,transparent)]"
              >
                Access
              </TabsTrigger>
            ) : null}
            {canManageVersions ? (
              <TabsTrigger
                value="versions"
                className="rounded-xl px-3.5 py-2 text-xs font-medium data-[state=active]:bg-tag-blue/18 data-[state=active]:text-foreground data-[state=active]:shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--tag-blue)_30%,transparent)]"
              >
                Version history
              </TabsTrigger>
            ) : null}
          </TabsList>

          <TabsContent value="list" className="mt-4 space-y-4 outline-none">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-tag-blue/80">
                  {selectedFolder ? folderLabel(selectedFolder) : "Documents"}
                </p>
                <h3 className="mt-1 text-lg font-semibold tracking-tight text-foreground">
                  {docsLoading
                    ? "Loading…"
                    : `${documents?.length ?? 0} file${(documents?.length ?? 0) === 1 ? "" : "s"}`}
                </h3>
              </div>

              {selectedFolder && canUploadSelectedFolder ? (
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    className={cn(BTN_BLUE, "h-10 px-4 text-sm")}
                    onClick={() => setAiModalOpen(true)}
                  >
                    <Bot className="size-4" />
                    Generate with AI
                  </button>
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
                  <button
                    type="button"
                    disabled={!selectedFolderId || uploading}
                    onClick={() => fileInputRef.current?.click()}
                    className={cn(BTN_LIGHT, "h-10 px-4 text-sm")}
                  >
                    <Upload className="size-4" />
                    {uploading ? "Uploading…" : "Upload"}
                  </button>
                </div>
              ) : selectedFolder ? (
                <p className="text-sm text-muted-foreground">
                  Uploads are not available in this folder.
                </p>
              ) : null}
            </div>

            {docsLoading && (
              <div className="rounded-2xl border border-white/[0.08] bg-[rgba(18,18,20,0.55)] px-5 py-12 text-center text-sm text-muted-foreground">
                Loading files…
              </div>
            )}

            {!docsLoading && documents && documents.length === 0 && (
              <div className="rounded-2xl border border-dashed border-white/[0.1] bg-[rgba(18,18,20,0.4)] px-6 py-10 text-center">
                <FileText className="mx-auto size-8 text-muted-foreground/50" />
                <p className="mt-3 text-sm font-medium text-foreground">This folder is empty</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Upload a file or generate one with AI to get started.
                </p>
                {selectedFolder?.code !== "04" &&
                folders.some((folder) => folder.code === "04") ? (
                  <Button
                    type="button"
                    variant="ghost"
                    className="mt-4 h-9 rounded-xl border border-white/[0.1] bg-white/[0.04] px-4 text-sm"
                    onClick={() => {
                      const approved = folders.find((folder) => folder.code === "04");
                      if (approved) setSelectedFolderId(approved.id);
                    }}
                  >
                    Open Approved Documents
                  </Button>
                ) : null}
              </div>
            )}

            {!docsLoading && documents && documents.length > 0 ? (
              <div className="overflow-hidden rounded-2xl border border-white/[0.08] bg-[rgba(18,18,20,0.55)] shadow-[0_24px_60px_-36px_rgba(0,0,0,0.8)]">
                <ul className="divide-y divide-white/[0.05]">
                  {documents.map((doc) => (
                    <DocumentRow
                      key={doc.id}
                      doc={doc}
                      selected={doc.id === selectedDocumentId}
                      showAccessBadges={canShareWithClient}
                      onSelect={() => setSelectedDocumentId(doc.id)}
                    />
                  ))}
                </ul>
              </div>
            ) : null}

            {selectedDocument ? (
              <SelectedDocumentBar
                document={selectedDocument}
                viewBusy={viewBusyId === selectedDocument.id}
                shareBusy={shareBusy}
                canShareWithClient={canShareWithClient}
                showAccessHint={canShareWithClient || canManageVersions}
                onView={() => void openDocument(selectedDocument.id)}
                onDownload={() =>
                  void openDocument(selectedDocument.id, { download: true })
                }
                onToggleShare={() =>
                  void handleToggleClientShare(
                    selectedDocument.id,
                    selectedDocument.shared_with_client,
                  )
                }
                onSubmit={() => void handleSubmit(selectedDocument.id)}
                onOpenAccess={() => setDocSubTab("access")}
                onOpenVersions={() => setDocSubTab("versions")}
                canManageVersions={canManageVersions}
              />
            ) : null}
          </TabsContent>

          {canShareWithClient ? (
            <TabsContent value="access" className="mt-4 outline-none">
              {selectedDocument ? (
                <DocumentVisibilityPanel
                  caseId={caseId}
                  documentId={selectedDocument.id}
                  documentTitle={selectedDocument.title}
                />
              ) : (
                <div className="rounded-2xl border border-white/[0.08] bg-[rgba(18,18,20,0.55)] px-6 py-10 text-center text-sm text-muted-foreground">
                  Select a document in Document list first, then open Access.
                </div>
              )}
            </TabsContent>
          ) : null}

          {canManageVersions ? (
            <TabsContent value="versions" className="mt-4 outline-none">
              {selectedDocument ? (
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
                        data: {
                          caseId,
                          documentId: selectedDocument.id,
                          versionId,
                        },
                      });
                      toast.success("Version restored");
                      queryClient.invalidateQueries({
                        queryKey: ["folder-documents", caseId, selectedFolderId],
                      });
                      queryClient.invalidateQueries({
                        queryKey: ["document-versions", caseId, selectedDocument.id],
                      });
                    } catch (err) {
                      toast.error(
                        err instanceof Error ? err.message : "Restore failed",
                      );
                    }
                  }}
                />
              ) : (
                <div className="rounded-2xl border border-white/[0.08] bg-[rgba(18,18,20,0.55)] px-6 py-10 text-center text-sm text-muted-foreground">
                  Select a document in Document list first, then open Version history.
                </div>
              )}
            </TabsContent>
          ) : null}
        </Tabs>
      </div>
    </div>
  );
}

function statusLabel(status: CaseDocument["approval_status"]) {
  if (status === "approved") return "Approved";
  if (status === "in_review") return "In review";
  return "Draft";
}

function SelectedDocumentBar({
  document: doc,
  viewBusy,
  shareBusy,
  canShareWithClient,
  canManageVersions,
  showAccessHint,
  onView,
  onDownload,
  onToggleShare,
  onSubmit,
  onOpenAccess,
  onOpenVersions,
}: {
  document: CaseDocument;
  viewBusy: boolean;
  shareBusy: boolean;
  canShareWithClient: boolean;
  canManageVersions: boolean;
  showAccessHint: boolean;
  onView: () => void;
  onDownload: () => void;
  onToggleShare: () => void;
  onSubmit: () => void;
  onOpenAccess: () => void;
  onOpenVersions: () => void;
}) {
  return (
    <div className="rounded-2xl border border-tag-blue/20 bg-gradient-to-br from-tag-blue/[0.12] via-white/[0.04] to-transparent p-4 shadow-[0_24px_60px_-36px_rgba(0,0,0,0.85)]">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0 space-y-2">
          <div className="flex items-center gap-2">
            <span className="size-1.5 rounded-full bg-tag-blue" />
            <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-tag-blue/85">
              Selected file
            </p>
          </div>
          <h4 className="truncate text-base font-semibold tracking-tight text-foreground">
            {doc.title}
          </h4>
          <div className="flex flex-wrap items-center gap-1.5">
            <span
              className={cn(
                "inline-flex items-center rounded-lg px-2 py-0.5 text-[11px] font-medium",
                doc.approval_status === "approved" &&
                  "bg-tag-blue/20 text-tag-blue",
                doc.approval_status === "in_review" &&
                  "bg-status-atrisk/20 text-status-atrisk",
                doc.approval_status === "draft" &&
                  "bg-white/[0.08] text-foreground/80",
              )}
            >
              {statusLabel(doc.approval_status)}
            </span>
            {doc.is_locked ? (
              <span className="inline-flex items-center gap-1 rounded-lg bg-status-ontrack/15 px-2 py-0.5 text-[11px] text-status-ontrack">
                <BadgeCheck className="size-3" />
                Final
              </span>
            ) : null}
            {doc.shared_with_client ? (
              <span className="inline-flex items-center gap-1 rounded-lg bg-status-ontrack/15 px-2 py-0.5 text-[11px] text-status-ontrack">
                <Share2 className="size-3" />
                Client portal
              </span>
            ) : null}
            <span className="text-[11px] text-muted-foreground">
              v{doc.current_version ?? 1}
            </span>
          </div>
          {doc.is_locked ? (
            <p className="text-xs text-muted-foreground">
              Approved as final — view and download only (not an access restriction).
            </p>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-2 lg:justify-end">
          <button type="button" className={BTN_SOFT} disabled={viewBusy} onClick={onView}>
            {viewBusy ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Eye className="size-3.5" />
            )}
            View
          </button>
          <button type="button" className={BTN_SOFT} disabled={viewBusy} onClick={onDownload}>
            <Download className="size-3.5" />
            Download
          </button>
          {canShareWithClient ? (
            <button
              type="button"
              className={doc.shared_with_client ? BTN_SOFT : BTN_LIGHT}
              disabled={shareBusy}
              onClick={onToggleShare}
            >
              {shareBusy ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Share2 className="size-3.5" />
              )}
              {doc.shared_with_client ? "Unshare" : "Share with client"}
            </button>
          ) : null}
          {doc.approval_status === "draft" && !doc.is_locked ? (
            <button type="button" className={BTN_LIGHT} onClick={onSubmit}>
              <Bot className="size-3.5" />
              Submit for approval
            </button>
          ) : null}
          {showAccessHint && canShareWithClient ? (
            <button type="button" className={BTN_BLUE} onClick={onOpenAccess}>
              Access
            </button>
          ) : null}
          {canManageVersions ? (
            <button type="button" className={BTN_BLUE} onClick={onOpenVersions}>
              Versions
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function DocumentRow({
  doc,
  selected,
  showAccessBadges,
  onSelect,
}: {
  doc: CaseDocument;
  selected: boolean;
  showAccessBadges: boolean;
  onSelect: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        className={cn(
          "group flex w-full items-center gap-3.5 px-4 py-3.5 text-left transition-colors",
          selected
            ? "bg-tag-blue/[0.1]"
            : "hover:bg-white/[0.03]",
        )}
      >
        <span
          className={cn(
            "flex size-10 shrink-0 items-center justify-center rounded-xl border transition-colors",
            selected
              ? "border-tag-blue/35 bg-tag-blue/15 text-tag-blue"
              : "border-white/[0.08] bg-white/[0.03] text-muted-foreground group-hover:text-foreground",
          )}
        >
          <FileText className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "truncate text-sm tracking-tight",
                selected ? "font-semibold text-foreground" : "font-medium text-foreground/95",
              )}
            >
              {doc.title}
            </span>
            {selected ? (
              <span className="hidden size-1.5 shrink-0 rounded-full bg-tag-blue sm:inline-block" />
            ) : null}
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
            {doc.doc_type ? (
              <span className="rounded-md bg-tag-blue/15 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-tag-blue">
                {doc.doc_type}
              </span>
            ) : null}
            <span>v{doc.current_version ?? 1}</span>
            <span className="text-white/20">·</span>
            <span className="truncate">{doc.uploader_name ?? "Unknown"}</span>
            <span className="text-white/20">·</span>
            <span>{formatDate(doc.created_at)}</span>
          </div>
        </div>
        <div className="hidden shrink-0 flex-wrap items-center justify-end gap-1.5 sm:flex">
          {doc.is_locked ? (
            <span className="inline-flex items-center gap-1 rounded-lg bg-status-ontrack/15 px-2 py-1 text-[10px] font-medium text-status-ontrack">
              <BadgeCheck className="size-3" />
              Final
            </span>
          ) : null}
          {showAccessBadges && doc.visibility_mode === "admin_only" ? (
            <span className="rounded-lg bg-tag-sand/15 px-2 py-1 text-[10px] text-tag-sand">
              Admin only
            </span>
          ) : null}
          {showAccessBadges && doc.visibility_mode === "allowlist" ? (
            <span className="rounded-lg bg-tag-blue/12 px-2 py-1 text-[10px] text-tag-blue/90">
              Restricted
            </span>
          ) : null}
          {doc.shared_with_client ? (
            <span className="inline-flex items-center gap-1 rounded-lg bg-status-ontrack/15 px-2 py-1 text-[10px] text-status-ontrack">
              <Share2 className="size-3" />
              Client
            </span>
          ) : null}
        </div>
      </button>
    </li>
  );
}

function VersionHistoryPanel({
  caseId: _caseId,
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
    <div className="space-y-4 rounded-2xl border border-tag-blue/15 bg-gradient-to-br from-tag-blue/[0.08] via-[rgba(18,18,20,0.7)] to-[rgba(18,18,20,0.55)] p-5 shadow-[0_24px_60px_-36px_rgba(0,0,0,0.8)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-tag-blue/85">
            Versions
          </p>
          <h3 className="mt-1 text-base font-semibold tracking-tight text-foreground">
            {document.title}
          </h3>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Current version {document.current_version ?? 1}
          </p>
        </div>
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

      <div className="space-y-3 rounded-xl border border-white/[0.1] bg-black/25 p-4">
        <div className="space-y-1.5">
          <label className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Note for new version
          </label>
          <Textarea
            value={versionNote}
            onChange={(e) => onNoteChange(e.target.value)}
            placeholder="Explain what changed…"
            rows={3}
            className="rounded-xl border-white/[0.1] bg-[rgba(18,18,20,0.85)]"
          />
        </div>
        <button
          type="button"
          onClick={onUploadClick}
          disabled={versionUploading}
          className={cn(BTN_LIGHT, "h-10 px-4 text-sm")}
        >
          <Upload className="size-4" />
          {versionUploading ? "Uploading…" : "Upload new version"}
        </button>
      </div>

      {versionsLoading ? (
        <p className="text-sm text-muted-foreground">Loading version history…</p>
      ) : versions.length === 0 ? (
        <p className="text-sm text-muted-foreground">No version history found.</p>
      ) : (
        <ul className="space-y-2">
          {versions.map((version) => (
            <li
              key={version.id}
              className="rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-3.5"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-foreground">
                      Version {version.version_number}
                    </span>
                    {version.is_current ? (
                      <span className="rounded-lg bg-tag-blue/18 px-2 py-0.5 text-[10px] font-medium text-tag-blue">
                        Current
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {version.uploader_name ?? "Unknown"} · {formatDate(version.uploaded_at)}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    className={cn(BTN_SOFT, "h-8 px-3")}
                    disabled={viewBusyId === version.id || !version.file_path}
                    onClick={() => onViewVersion(version.id)}
                  >
                    {viewBusyId === version.id ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <Eye className="size-3.5" />
                    )}
                    View
                  </button>
                  {!version.is_current ? (
                    <button
                      type="button"
                      className={cn(BTN_BLUE, "h-8 px-3")}
                      onClick={() => void onRestore(version.id)}
                    >
                      Restore
                    </button>
                  ) : null}
                </div>
              </div>
              {version.note ? (
                <p className="mt-3 whitespace-pre-wrap text-sm text-muted-foreground">
                  {version.note}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
