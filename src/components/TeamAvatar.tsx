"use client";

import { useState, useEffect } from "react";
import type { TeamSummary } from "@/lib/types";
import { teamInitials } from "@/lib/user-display";

interface Props {
  team: Pick<TeamSummary, "name" | "avatar_url">;
  size?: "xs" | "sm" | "md" | "lg";
}

const SIZE = {
  xs: "w-5 h-5 text-[10px]",
  sm: "w-8 h-8 text-xs",
  md: "w-12 h-12 text-sm",
  lg: "w-16 h-16 text-lg",
};

// Team avatars are plain HTTPS image URLs (same convention as user avatars).
// A DAM-backed picker (like togra's, resolving Comad asset thumbnails through
// an authenticated proxy) can replace this once Tack has its own DAM integration.
export default function TeamAvatar({ team, size = "md" }: Props) {
  const [broken, setBroken] = useState(false);
  useEffect(() => setBroken(false), [team.avatar_url]);

  const initials = teamInitials(team.name) || "T";

  if (team.avatar_url && !broken) {
    return (
      <img
        src={team.avatar_url}
        alt={team.name}
        className={`${SIZE[size]} rounded-full object-cover shrink-0`}
        onError={() => setBroken(true)}
      />
    );
  }

  return (
    <div
      className={`${SIZE[size]} rounded-full bg-rose-100 text-rose-700 font-semibold flex items-center justify-center shrink-0 select-none`}
    >
      {initials}
    </div>
  );
}
