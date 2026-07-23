// ── Team types (ullav-user-management) ────────────────────────────────────────

export interface TeamUserRef {
  id: string;
  username: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
}

export interface TeamRole {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export interface TeamMember {
  id: string;
  user: TeamUserRef;
  status: "invited" | "active" | "inactive";
  role: "owner" | "leader" | "member";
  team_roles: TeamRole[];
  invited_at: string;
  joined_at: string | null;
}

export interface Team {
  id: string;
  name: string;
  description: string | null;
  purpose: string | null;
  avatar_url: string | null;
  owner: TeamUserRef;
  leader: TeamUserRef;
  members: TeamMember[];
  created_at: string;
  updated_at: string;
}

export interface TeamSummary {
  id: string;
  name: string;
  description: string | null;
  avatar_url: string | null;
  owner: TeamUserRef;
  leader: TeamUserRef;
  member_count: number;
  created_at: string;
  updated_at: string;
}
