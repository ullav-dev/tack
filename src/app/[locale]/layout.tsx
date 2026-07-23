import type { Metadata } from "next";
import { Geist } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getMessages } from "next-intl/server";
import { notFound } from "next/navigation";
import { routing } from "@/i18n/routing";
import "../globals.css";
import Nav from "@/components/Nav";
import Footer from "@/components/Footer";
import { AuthProvider } from "@/contexts/AuthContext";
import { TeamProvider } from "@/contexts/TeamContext";

const geist = Geist({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Tack",
  description: "Notes & Pages",
  icons: { icon: "/icon.svg" },
};

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!routing.locales.includes(locale as never)) notFound();

  const messages = await getMessages();

  return (
    <html lang={locale} className="h-full">
      <body className={`${geist.className} bg-slate-50 text-slate-900 flex flex-col h-full`}>
        <NextIntlClientProvider messages={messages}>
          <AuthProvider>
            <TeamProvider>
              <Nav />
              <main className="flex-1 overflow-auto relative">{children}</main>
              <Footer />
            </TeamProvider>
          </AuthProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
