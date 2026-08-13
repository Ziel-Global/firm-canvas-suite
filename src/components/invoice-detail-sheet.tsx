import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { InvoiceDetailContent } from "@/components/invoice-detail-content";

export function InvoiceDetailSheet({
  open,
  onOpenChange,
  invoiceId,
  isAdmin,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoiceId: string | null;
  isAdmin: boolean;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col gap-0 overflow-y-auto sm:max-w-xl">
        <SheetHeader className="sr-only">
          <SheetTitle>Invoice</SheetTitle>
        </SheetHeader>
        {invoiceId ? (
          <InvoiceDetailContent
            invoiceId={invoiceId}
            isAdmin={isAdmin}
            onVoided={() => onOpenChange(false)}
          />
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
