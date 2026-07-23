"use client";

import { useEffect } from "react";
import { useRouter } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { useAuth } from "@/contexts/AuthContext";
import { useTeam } from "@/contexts/TeamContext";
import { displayName } from "@/lib/user-display";
import TackIcon from "@/components/TackIcon";

export default function HomePage() {
  const { user, isLoading } = useAuth();
  const { activeTeam } = useTeam();
  const router = useRouter();
  const t = useTranslations("home");

  useEffect(() => {
    if (isLoading) return;
    if (!user) router.replace("/login");
  }, [isLoading, user, router]);

  if (isLoading || !user) return null;

  return (
    <div className="h-full flex items-center justify-center p-4">
      <div className="text-center max-w-md">
        <TackIcon className="w-14 h-14 mx-auto mb-5" />
        <h1 className="text-xl font-bold text-slate-800 mb-2">
          {t("welcome", { name: displayName(user) })}
        </h1>
        <p className="text-sm text-slate-500 mb-1">{t("tagline")}</p>
        {activeTeam && (
          <p className="text-xs text-slate-400 mt-4">{t("activeTeam", { team: activeTeam.name })}</p>
        )}
      </div>
    </div>
  );
}
