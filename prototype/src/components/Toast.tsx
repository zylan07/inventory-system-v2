"use client";

import { useEffect } from "react";

export default function Toast({
  message,
  type,
  onClose,
}: {
  message: string;
  type: "success" | "error";
  onClose?: () => void;
}) {
  useEffect(() => {
    const timer = setTimeout(() => {
      if (onClose) onClose();
    }, 3000);

    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <div
      className="app-toast"
      style={{
        position: "fixed",
        top: "20px",
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 99999,
        background: type === "success" ? "#16a34a" : "#dc2626",
        color: "white",
        padding: "12px 20px",
        borderRadius: "8px",
        fontWeight: 600,
        boxShadow: "0 6px 20px rgba(0,0,0,0.25)",
        minWidth: "250px",
        textAlign: "center",
      }}
    >
      {message}
    </div>
  );
}