import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";

import { bootstrapSuperAdmin } from "@/lib/bootstrap.functions";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/bootstrap")({
  head: () => ({
    meta: [{ title: "verdio" }],
  }),
  component: BootstrapPage,
});

function BootstrapPage() {
  const run = useServerFn(bootstrapSuperAdmin);
  const [state, setState] = useState<
    | { kind: "idle" }
    | { kind: "loading" }
    | { kind: "created"; email: string }
    | { kind: "disabled" }
    | { kind: "error"; message: string }
  >({ kind: "idle" });

  async function handleClick() {
    setState({ kind: "loading" });
    try {
      const result = await run();
      if (result.status === "created") {
        setState({ kind: "created", email: result.email });
      } else {
        setState({ kind: "disabled" });
      }
    } catch (err) {
      setState({
        kind: "error",
        message: err instanceof Error ? err.message : "Something went wrong",
      });
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas p-4">
      <div className="w-full max-w-md rounded-card bg-surface p-8 shadow-sm">
        <h1 className="text-2xl font-semibold text-text">First-time setup</h1>
        <p className="mt-2 text-muted">
          Create the first Super Admin account. This runs only once — once any
          account exists it is permanently disabled.
        </p>

        <Button
          className="mt-6 w-full"
          onClick={handleClick}
          disabled={state.kind === "loading"}
        >
          {state.kind === "loading" ? "Creating…" : "Create first Super Admin"}
        </Button>

        {state.kind === "created" && (
          <div className="mt-6 rounded-control bg-tag-green/30 p-4 text-sm text-text">
            <p className="font-medium">Super Admin created.</p>
            <p className="mt-1">Email: {state.email}</p>
            <p>You can now sign in at the login page.</p>
          </div>
        )}

        {state.kind === "disabled" && (
          <div className="mt-6 rounded-control bg-frame p-4 text-sm text-text">
            Bootstrap is disabled — an account already exists.
          </div>
        )}

        {state.kind === "error" && (
          <div className="mt-6 rounded-control bg-status-overdue/20 p-4 text-sm text-text">
            {state.message}
          </div>
        )}
      </div>
    </div>
  );
}
