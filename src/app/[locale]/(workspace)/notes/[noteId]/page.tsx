"use client";

import { useParams } from "next/navigation";
import NoteThread from "@/components/NoteThread";

export default function NoteThreadPage() {
  const { noteId } = useParams<{ noteId: string }>();
  return <NoteThread noteId={noteId} />;
}
