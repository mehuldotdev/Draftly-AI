import type { Metadata } from "next";
import { Jost } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { QueryProvider } from "@/context/query-provider";

const jostSans = Jost({
  weight: ["100", "200", "300", "400", "500", "600", "700", "800", "900"],
});

export const metadata: Metadata = {
  title: "Draftly - AI-powered design assistant",
  description: "Draftly is an AI-powered design assistant that helps you create stunning mobile app designs in seconds. Simply describe your app idea, and Draftly will generate beautiful, customizable screens for you to kickstart your project.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head><script data-domain="draftly-ai-eta.vercel.app"
data-site-id="P-1ARZZJDAVIGRHJO3U0HQ7" src="https://r4xctaue.insforge.site/js/pixel.js" defer></script></head>
      <body className={`${jostSans.className} antialiased`}>
        <QueryProvider>
          <ThemeProvider
            attribute="class"
            defaultTheme="system"
            enableSystem
            disableTransitionOnChange
          >
            {children}
            <Toaster richColors position="bottom-center" />
          </ThemeProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
