import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Plus } from "lucide-react";

import { listTasks } from "@/lib/tasks.functions";
import { Button } from "@/components/ui/button";
import { TaskListView } from "@/components/task-list-view";
import { NewTaskSheet } from "@/components/new-task-sheet";

export function CaseTasksTab({ caseId }: { caseId: string }) {
  const fetchTasks = useServerFn(listTasks);
  const [sheetOpen, setSheetOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["tasks", { caseId }],
    queryFn: () => fetchTasks({ data: { caseId } }),
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Tasks</h3>
          <p className="text-xs text-muted-foreground">
            Tasks scoped to this case. Visibility and assignment follow your role.
          </p>
        </div>
        <Button size="sm" onClick={() => setSheetOpen(true)}>
          <Plus className="mr-1.5 size-4" />
          Add task
        </Button>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading tasks…</p>
      ) : (
        <TaskListView tasks={data ?? []} showCase={false} />
      )}

      <NewTaskSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        defaultCaseId={caseId}
        lockCase
      />
    </div>
  );
}
