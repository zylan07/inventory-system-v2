import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "@/components/AuthProvider";
import { ToastProvider } from "@/components/ToastProvider";
import Sidebar from "@/components/Layout/Sidebar";
import Navbar from "@/components/Layout/Navbar";

export const metadata: Metadata = {
  title: "Inventra — Inventory Management",
  description: "Modern Inventory Management System",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
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
      </body>
    </html>
  );
}
