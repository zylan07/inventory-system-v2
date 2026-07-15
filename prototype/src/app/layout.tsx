import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "@/components/AuthProvider";
import { ToastProvider } from "@/components/ToastProvider";
import { GoogleOAuthProvider } from "@react-oauth/google";
import Sidebar from "@/components/Layout/Sidebar";
import Navbar from "@/components/Layout/Navbar";
import InstallPrompt from "@/components/PWA/InstallPrompt";

export const metadata: Metadata = {
  title: "Inventory Management System",
  description: "Modern Inventory Management System",
  manifest: "/manifest.json",
  themeColor: "#2563eb",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || 'placeholder';
  console.log("⚡ [RootLayout] Initializing GoogleOAuthProvider with Client ID:", clientId);
  
  if (!clientId || clientId === 'placeholder') {
    console.warn("⚠️ [RootLayout] WARNING: Google Client ID is missing or set to 'placeholder'. Google Login will fail with 'invalid_client'.");
  }

  return (
    <html lang="en">
      <body>
        <GoogleOAuthProvider clientId={clientId}>
          <AuthProvider>
            <ToastProvider>
              <div style={{ display: 'flex', width: '100%', height: '100vh', overflow: 'hidden' }}>
              <Sidebar />
              <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden', minWidth: 0 }}>
                <Navbar />
                <main style={{
                  flex: 1,
                  overflowY: 'auto',
                  padding: '1.5rem',
                  background: 'var(--background)',
                }}>
                  {children}
                </main>
              </div>
            </div>
            </ToastProvider>
          </AuthProvider>
        </GoogleOAuthProvider>
        <InstallPrompt />
      </body>
    </html>
  );
}
