"use client";

import ResizableSplit from "@/components/ResizableSplit";
import Navigator from "@/components/Navigator";
import { PageEventsProvider } from "@/contexts/PageEventsContext";

/** Full-width workspace shell (Spaces/Pages/Notes) — persistent left
 * Navigator via ResizableSplit, page/note content on the right as
 * `children`. No max-width/centering wrapper here: the landing page's
 * centering is scoped to itself, not the shared `[locale]/layout.tsx`, so
 * this route group is free to use the full browser width.
 *
 * `PageEventsProvider` lets PageEditor (right pane) tell PageTree (left
 * pane, inside Navigator) about metadata changes like a title edit — they're
 * siblings with no other shared state. */
export default function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  return (
    <PageEventsProvider>
      <div className="h-full">
        <ResizableSplit
          storageKey="tack_navigator_width"
          left={<Navigator />}
          right={<div className="h-full overflow-y-auto">{children}</div>}
        />
      </div>
    </PageEventsProvider>
  );
}
