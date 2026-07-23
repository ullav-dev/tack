// Pure display-name helpers, factored out so they're unit-testable independent of React.

export interface NameParts {
  first_name?: string | null;
  last_name?: string | null;
  username?: string | null;
}

/** "Jane Doe", falling back to the username if both name parts are empty. */
export function displayName(person: NameParts): string {
  const full = `${person.first_name ?? ""} ${person.last_name ?? ""}`.trim();
  return full || person.username || "";
}

/** "JD", falling back to the first letter of the username. */
export function userInitials(person: NameParts): string {
  const first = person.first_name?.charAt(0) ?? "";
  const last = person.last_name?.charAt(0) ?? "";
  const initials = (first + last).toUpperCase();
  return initials || (person.username?.charAt(0).toUpperCase() ?? "");
}

/** Initials derived from a team/group name, e.g. "Design Team" → "DT". */
export function teamInitials(name: string): string {
  return name
    .split(/[\s-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}
