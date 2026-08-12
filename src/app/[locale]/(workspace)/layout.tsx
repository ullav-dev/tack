"use client";

import { useEffect } from "react";
import { useRouter } from "@/i18n/navigation";
import { useAuth } from "@/contexts/AuthContext";
import ResizableSplit from "@/components/ResizableSplit";
import Navigator from "@/components/Navigator";
import { PageEventsProvider } from "@/contexts/PageEventsContext";
import { NoteEventsProvider } from "@ullav-dev/tack-notes";

/** Full-width workspace shell (Spaces/Pages/Notes) — persistent left
 * Navigator via ResizableSplit, page/note content on the right as
 * `children`. No max-width/centering wrapper here: the landing page's
 * centering is scoped to itself, not the shared `[locale]/layout.tsx`, so
 * this route group is free to use the full browser width.
 *
 * `PageEventsProvider`/`NoteEventsProvider` let PageEditor/NoteThread (right
 * pane) tell PageTree/NoteTree (left pane, inside Navigator) about metadata
 * changes like a title edit — they're siblings with no other shared state.
 *
 * Also guards auth like the home page does: if the session ends (idle
 * timeout, manual logout) while parked on a notes/spaces route, `user` goes
 * null here too and this redirects to /login — without it, this route group
 * had no such check and an idle-timed-out session was stuck showing a dead
 * workspace (nav/panels visible, every action failing) instead of bouncing
 * back to the landing/login flow like `/` already does. */
export default function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !user) router.replace("/login");
  }, [isLoading, user, router]);

  if (isLoading || !user) return null;

  return (
    <PageEventsProvider>
      <NoteEventsProvider>
        <div className="h-full">
          <ResizableSplit
            storageKey="tack_navigator_width"
            left={<Navigator />}
            right={<div className="h-full overflow-y-auto">{children}</div>}
          />
        </div>
      </NoteEventsProvider>
    </PageEventsProvider>
  );
}
