"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { getTeam } from "@/lib/auth-api";
import { displayName } from "@/lib/user-display";

/** Resolves a team's member roster into a `user id -> display name` map, for
 * turning a bare `created_by` UUID (all a Note/reply carries) into something
 * readable — mirrors `togra/src/components/notes/NotesPanel.tsx`'s
 * `resolveCreator` pattern, just sourced from a live `GET /teams/{id}` call
 * here instead of a `members` prop passed down from a page that already had
 * the roster loaded. */
export function useTeamRoster(teamId: string | null) {
  const { token } = useAuth();
  const [names, setNames] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    if (!token || !teamId) {
      setNames(new Map());
      return;
    }
    let cancelled = false;
    getTeam(token, teamId)
      .then((team) => {
        if (cancelled) return;
        const map = new Map<string, string>();
        map.set(team.owner.id, displayName(team.owner));
        map.set(team.leader.id, displayName(team.leader));
        for (const member of team.members) {
          map.set(member.user.id, displayName(member.user));
        }
        setNames(map);
      })
      .catch(() => {
        // Non-fatal: author names just fall back to a truncated id.
      });
    return () => {
      cancelled = true;
    };
  }, [token, teamId]);

  return function resolveAuthor(userId: string): string {
    return names.get(userId) ?? `${userId.slice(0, 8)}…`;
  };
}
