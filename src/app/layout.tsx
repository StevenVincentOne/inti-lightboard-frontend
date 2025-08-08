import type { Metadata } from "next";
import "./globals.css";
import localFont from "next/font/local";
import ConsentModal from "./ConsentModal";

export const metadata: Metadata = {
  title: "Inti - Voice AI Agent",
  description: "Voice-first AI agent for document creation and creativity.",
  manifest: "/manifest.json",
  themeColor: "#000000",
  viewport: "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black",
    title: "Inti"
  }
};

const satoshi = localFont({
  src: [
    {
      path: "../assets/fonts/Satoshi-Variable.woff2",
      weight: "300 900",
      style: "normal",
    },
    {
      path: "../assets/fonts/Satoshi-VariableItalic.woff2",
      weight: "300 900",
      style: "italic",
    },
  ],
  variable: "--font-satoshi",
  display: "swap",
});

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={satoshi.className}>
      <head>
        {/* PWA manifest */}
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#000000" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black" />
        <meta name="apple-mobile-web-app-title" content="Inti" />
        
        {/* Icons */}
        <link rel="icon" href="/icon-192.png" />
        <link rel="apple-touch-icon" href="/icon-192.png" />
        
        {/* Needed for debugging JSON styling */}
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/npm/pretty-print-json@3.0/dist/css/pretty-print-json.dark-mode.css"
        />
      </head>
      <body>
        {children}
        <ConsentModal />
        
        {/* Service Worker Registration */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              if ("serviceWorker" in navigator) {
                window.addEventListener("load", function() {
                  navigator.serviceWorker.register("/service-worker.js")
                    .then(function(registration) {
                      console.log("SW registered: ", registration);
                    })
                    .catch(function(registrationError) {
                      console.log("SW registration failed: ", registrationError);
                    });
                });
              }
            `,
          }}
        />
      </body>
    </html>
  );
}
