"use client";

import { useMemo } from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { TackNoteThread, createTackNotesApi } from "@ullav-dev/tack-notes";
import { useAuth } from "@/contexts/AuthContext";
import { isAdmin } from "@/lib/auth-api";
import { useMultiTeamRoster } from "@/hooks/useMultiTeamRoster";
import TackNotesImagePicker from "@/components/TackNotesImagePicker";

export default function NoteThreadPage() {
  const { noteId } = useParams<{ noteId: string }>();
  const { token, user } = useAuth();
  const router = useRouter();
  const t = useTranslations("notes");
  const resolveAuthor = useMultiTeamRoster();
  const api = useMemo(() => (token ? createTackNotesApi("/api", token) : null), [token]);

  if (!token || !user || !api) return <p className="p-6 text-slate-400">{t("loading")}</p>;

  return (
    <TackNoteThread
      noteId={noteId}
      api={api}
      currentUserId={user.id}
      isAdmin={isAdmin(token)}
      resolveAuthor={resolveAuthor}
      t={t}
      onNavigateAfterDelete={() => router.push("/notes")}
      ImagePicker={TackNotesImagePicker}
    />
  );
}
