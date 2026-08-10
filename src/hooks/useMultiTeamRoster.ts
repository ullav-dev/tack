"use client";

import { useCallback, useRef, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { getTeam } from "@/lib/auth-api";
import { displayName } from "@/lib/user-display";

/** Resolves a `(userId, teamId)` pair into a display name, for
 * `@ullav-dev/tack-notes`'s `resolveAuthor` prop -- turning a bare
 * `created_by` UUID (all a Note/reply carries) into something readable.
 * Unlike the old single-team `useTeamRoster` hook this replaces, `teamId`
 * isn't known until `TackNoteThread` has loaded the note itself, so this
 * caches rosters per team (a Map, not a single team's worth of state) and
 * fetches lazily the first time a given team is actually asked about --
 * covers the same "admin viewing a note from a team they don't otherwise
 * browse" case the original hook handled by keying off the note's own
 * `team_id` rather than the active team. */
export function useMultiTeamRoster() {
  const { token } = useAuth();
  const [, forceRender] = useState(0);
  const rostersRef = useRef<Map<string, Map<string, string>>>(new Map());
  const pendingRef = useRef<Set<string>>(new Set());

  const resolveAuthor = useCallback(
    (userId: string, teamId: string | null): string => {
      if (!teamId || !token) return `${userId.slice(0, 8)}…`;
      const roster = rostersRef.current.get(teamId);
      if (roster) return roster.get(userId) ?? `${userId.slice(0, 8)}…`;

      if (!pendingRef.current.has(teamId)) {
        pendingRef.current.add(teamId);
        getTeam(token, teamId)
          .then((team) => {
            const map = new Map<string, string>();
            map.set(team.owner.id, displayName(team.owner));
            map.set(team.leader.id, displayName(team.leader));
            for (const member of team.members) {
              map.set(member.user.id, displayName(member.user));
            }
            rostersRef.current.set(teamId, map);
            forceRender((n) => n + 1);
          })
          .catch(() => {
            // Non-fatal: author names just fall back to a truncated id.
            // Cache an empty roster so a permanently-failing team doesn't
            // retry on every render.
            rostersRef.current.set(teamId, new Map());
            forceRender((n) => n + 1);
          })
          .finally(() => {
            pendingRef.current.delete(teamId);
          });
      }
      return `${userId.slice(0, 8)}…`;
    },
    [token]
  );

  return resolveAuthor;
}
