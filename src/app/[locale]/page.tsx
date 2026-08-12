"use client";

import { useEffect } from "react";
import { useRouter } from "@/i18n/navigation";
import { useAuth } from "@/contexts/AuthContext";

/** "/" is not a landing page in its own right -- it just routes straight
 * into the workspace (the Navigator's own Notes/Spaces tabs are the real
 * entry point, so a separate welcome screen here would only be one more
 * click between login and actually working). Signed-in users land on
 * /notes (the Navigator's own default tab, see Navigator.tsx's
 * loadStoredTab); signed-out users go to /login, same as every other
 * protected route. */
export default function HomePage() {
  const { user, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;
    router.replace(user ? "/notes" : "/login");
  }, [isLoading, user, router]);

  return null;
}
