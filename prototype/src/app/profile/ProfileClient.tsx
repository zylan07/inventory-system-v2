"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/apiFetch";
import { useToast } from "@/components/ToastProvider";

type UserProfile = {
  id: number;
  email: string;
  name: string;
  profile_image: string | null;
  role: 'Admin' | 'Manager' | 'Basic User';
  is_active: boolean;
  google_id: string | null;
  created_at: string;
};

export default function ProfileClient({ initialProfile, refresh }: { initialProfile: UserProfile; refresh: () => void }) {
  const router = useRouter();
  const { showToast } = useToast();
  const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';

  // --- Section 1: Account Information States ---
  const [name, setName] = useState(initialProfile.name || "");
  const [profileImage, setProfileImage] = useState<string | null>(initialProfile.profile_image);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState<string | null>(null);
  const [removeAvatar, setRemoveAvatar] = useState(false);
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  // --- Section 2: Security / Password States ---
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [isSavingPassword, setIsSavingPassword] = useState(false);

  // Sync state if initialProfile changes
  useEffect(() => {
    setName(initialProfile.name || "");
    setProfileImage(initialProfile.profile_image);
  }, [initialProfile]);

  // Unsaved changes detection for Section 1 only
  const hasUnsavedChanges = 
    name.trim() !== (initialProfile.name || "").trim() ||
    selectedFile !== null ||
    removeAvatar;

  // Before unload listener (browser exit/refresh lock)
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [hasUnsavedChanges]);

  // Format created_at to e.g. "15 July 2026"
  const formatDate = (dateString: string) => {
    if (!dateString) return "Not Available";
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) return "Not Available";
      return date.toLocaleDateString("en-GB", {
        day: "numeric",
        month: "long",
        year: "numeric"
      });
    } catch {
      return "Not Available";
    }
  };

  // Image Selection Handler (Local preview only)
  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    if (!file) return;

    // MIME type check
    const allowedTypes = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
    if (!allowedTypes.includes(file.type.toLowerCase())) {
      showToast("Only JPG, JPEG, PNG, and WEBP images are allowed.", "error");
      return;
    }

    // Capped file extension check
    const ext = file.name.substring(file.name.lastIndexOf(".")).toLowerCase();
    const allowedExts = [".jpg", ".jpeg", ".png", ".webp"];
    if (!allowedExts.includes(ext)) {
      showToast("Only JPG, JPEG, PNG, and WEBP image files are allowed.", "error");
      return;
    }

    // Size limit check (2MB)
    if (file.size > 2 * 1024 * 1024) {
      showToast("Image size must be less than 2MB.", "error");
      return;
    }

    setSelectedFile(file);
    setRemoveAvatar(false);

    if (avatarPreviewUrl) {
      URL.revokeObjectURL(avatarPreviewUrl);
    }
    setAvatarPreviewUrl(URL.createObjectURL(file));
  };

  // Avatar Removal (sets locally deleted preview status)
  const handleRemoveAvatarClick = () => {
    setSelectedFile(null);
    if (avatarPreviewUrl) {
      URL.revokeObjectURL(avatarPreviewUrl);
      setAvatarPreviewUrl(null);
    }
    setRemoveAvatar(true);
  };

  // Reset Section 1 Handler
  const handleResetProfile = () => {
    setName(initialProfile.name || "");
    setProfileImage(initialProfile.profile_image);
    setSelectedFile(null);
    if (avatarPreviewUrl) {
      URL.revokeObjectURL(avatarPreviewUrl);
      setAvatarPreviewUrl(null);
    }
    setRemoveAvatar(false);
    showToast("Profile edits reset to original values", "success");
  };

  // Save Section 1 Profile details
  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      showToast("Name cannot be empty", "error");
      return;
    }

    setIsSavingProfile(true);
    try {
      const formData = new FormData();
      formData.append("name", name.trim());
      if (selectedFile) {
        formData.append("avatar", selectedFile);
      }
      formData.append("removeAvatar", String(removeAvatar));

      const res = await apiFetch("/profile", {
        method: "PUT",
        body: formData
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.message || "Failed to update profile");
      }

      showToast("Profile information updated successfully", "success");
      setSelectedFile(null);
      setAvatarPreviewUrl(null);
      setRemoveAvatar(false);
      refresh(); // refresh navbar and profile details
    } catch (err: any) {
      showToast(err.message || "Failed to update profile", "error");
    } finally {
      setIsSavingProfile(false);
    }
  };

  // Change Password Section 2 Handler
  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentPassword || !newPassword || !confirmPassword) {
      showToast("All password fields are required", "error");
      return;
    }
    if (newPassword.length < 8) {
      showToast("New password must be at least 8 characters long.", "error");
      return;
    }
    if (newPassword !== confirmPassword) {
      showToast("New password and confirmation do not match.", "error");
      return;
    }

    setIsSavingPassword(true);
    try {
      const res = await apiFetch("/profile/password", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPassword,
          newPassword,
          confirmPassword
        })
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.message || "Failed to update password");
      }

      showToast("Password changed successfully", "success");
      handleClearPassword();
    } catch (err: any) {
      showToast(err.message || "Failed to update password", "error");
    } finally {
      setIsSavingPassword(false);
    }
  };

  // Reset/Clear Password Fields
  const handleClearPassword = () => {
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    showToast("Password fields cleared", "success");
  };

  // Cancel overall page navigation redirect
  const handleCancelClick = () => {
    if (hasUnsavedChanges) {
      if (!confirm("You have unsaved changes. Leave without saving?")) {
        return;
      }
    }
    if (window.history.length > 1) {
      router.back();
    } else {
      router.push("/dashboard");
    }
  };

  // Determine current active avatar source URL
  let resolvedAvatarUrl = "";
  if (avatarPreviewUrl) {
    resolvedAvatarUrl = avatarPreviewUrl;
  } else if (removeAvatar) {
    resolvedAvatarUrl = ""; // empty placeholder
  } else if (profileImage) {
    resolvedAvatarUrl = profileImage.startsWith("http") 
      ? profileImage 
      : `${baseUrl}${profileImage}`;
  }

  const isGoogleUser = !!initialProfile.google_id;

  return (
    <div style={{ maxWidth: "680px", margin: "0 auto", padding: "1rem 0" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
        <div>
          <h1 style={{ margin: 0 }}>My Profile</h1>
          <p style={{ color: "var(--foreground-muted)", fontSize: "0.875rem", marginTop: "0.25rem" }}>
            Manage your personal profile details and security settings.
          </p>
        </div>
        <button
          type="button"
          onClick={handleCancelClick}
          className="btn-secondary"
          style={{ padding: "0.5rem 1rem", borderRadius: "6px" }}
        >
          Cancel
        </button>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
        {/* Section 1: Account Information Card */}
        <div className="card">
          <h2 style={{ fontSize: "1.1rem", fontWeight: 700, borderBottom: "1px solid var(--border)", paddingBottom: "0.75rem", marginBottom: "1.25rem" }}>
            Account Information
          </h2>

          <form onSubmit={handleSaveProfile}>
            {/* Profile Picture Uploader Row */}
            <div className="profile-avatar-row" style={{ display: "flex", alignItems: "center", gap: "1.5rem", marginBottom: "1.5rem", flexWrap: "wrap" }}>
              <div style={{
                width: "96px",
                height: "96px",
                borderRadius: "50%",
                background: "var(--secondary)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                overflow: "hidden",
                border: "2px solid var(--border)",
                flexShrink: 0
              }}>
                {resolvedAvatarUrl ? (
                  <img 
                    src={resolvedAvatarUrl} 
                    alt="Avatar Preview" 
                    style={{ width: "100%", height: "100%", objectFit: "cover" }} 
                  />
                ) : (
                  <span style={{ fontSize: "3rem", color: "var(--foreground-muted)" }}>👤</span>
                )}
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                <div style={{ display: "flex", gap: "0.5rem" }}>
                  <label 
                    className="btn-secondary" 
                    style={{ 
                      padding: "0.45rem 0.875rem", 
                      fontSize: "0.8rem", 
                      borderRadius: "6px", 
                      cursor: "pointer", 
                      fontWeight: 600,
                      border: "1px solid var(--border)"
                    }}
                  >
                    {resolvedAvatarUrl ? "Change Picture" : "Upload Picture"}
                    <input 
                      type="file" 
                      accept=".jpg,.jpeg,.png,.webp" 
                      onChange={handleImageChange} 
                      style={{ display: "none" }} 
                    />
                  </label>
                  
                  {resolvedAvatarUrl && (
                    <button
                      type="button"
                      onClick={handleRemoveAvatarClick}
                      className="btn-secondary"
                      style={{ 
                        padding: "0.45rem 0.875rem", 
                        fontSize: "0.8rem", 
                        borderRadius: "6px", 
                        color: "var(--danger)",
                        borderColor: "#fee2e2"
                      }}
                    >
                      Remove Picture
                    </button>
                  )}
                </div>
                <span style={{ fontSize: "0.75rem", color: "var(--foreground-muted)" }}>
                  Supported formats: JPG, JPEG, PNG, WEBP. Max size: 2MB.
                </span>
              </div>
            </div>

            {/* Editable Name Input */}
            <div style={{ marginBottom: "1.25rem" }}>
              <label style={labelStyle}>Full Name</label>
              <input 
                type="text" 
                required 
                placeholder="Enter your name"
                value={name} 
                onChange={e => setName(e.target.value)} 
                style={inputStyle}
              />
            </div>

            {/* Read-only details grid */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "1rem 1.5rem", marginBottom: "1.5rem" }}>
              <div>
                <label style={readOnlyLabelStyle}>Email Address</label>
                <div style={readOnlyValStyle}>{initialProfile.email}</div>
              </div>
              
              <div>
                <label style={readOnlyLabelStyle}>User Role</label>
                <div style={{ display: "flex", marginTop: "0.25rem" }}>
                  <span className={`badge badge-${initialProfile.role === 'Admin' ? 'admin' : initialProfile.role === 'Manager' ? 'manager' : 'user'}`}>
                    {initialProfile.role}
                  </span>
                </div>
              </div>

              <div>
                <label style={readOnlyLabelStyle}>Login Method</label>
                <div style={readOnlyValStyle}>{isGoogleUser ? "Google OAuth" : "Email & Password"}</div>
              </div>

              <div>
                <label style={readOnlyLabelStyle}>Account Status</label>
                <div style={readOnlyValStyle}>{initialProfile.is_active ? "Active" : "Suspended"}</div>
              </div>

              <div>
                <label style={readOnlyLabelStyle}>Member Since</label>
                <div style={readOnlyValStyle}>{formatDate(initialProfile.created_at)}</div>
              </div>
            </div>

            {/* Save & Reset buttons for Section 1 */}
            <div className="profile-actions" style={{ display: "flex", gap: "0.5rem", borderTop: "1px solid var(--border)", paddingTop: "1rem", justifyContent: "flex-end" }}>
              <button 
                type="button" 
                onClick={handleResetProfile} 
                className="btn-secondary"
                disabled={isSavingProfile}
                style={{ padding: "0.5rem 1rem", borderRadius: "6px", fontWeight: 600 }}
              >
                Reset
              </button>
              <button 
                type="submit" 
                className="btn-primary"
                disabled={isSavingProfile}
                style={{ padding: "0.5rem 1rem", borderRadius: "6px" }}
              >
                {isSavingProfile ? "Saving..." : "Save Profile"}
              </button>
            </div>
          </form>
        </div>

        {/* Section 2: Security Card */}
        <div className="card">
          <h2 style={{ fontSize: "1.1rem", fontWeight: 700, borderBottom: "1px solid var(--border)", paddingBottom: "0.75rem", marginBottom: "1.25rem" }}>
            Security & Credentials
          </h2>

          {isGoogleUser ? (
            <div style={{ 
              background: "var(--secondary)", 
              border: "1.5px solid var(--border)", 
              borderRadius: "8px", 
              padding: "1rem", 
              textAlign: "center", 
              fontSize: "0.85rem",
              color: "var(--foreground-muted)"
            }}>
              Your password is managed through your Google Account.
            </div>
          ) : (
            <form onSubmit={handleChangePassword}>
              {/* Current Password Field */}
              <div style={{ marginBottom: "1rem" }}>
                <label style={labelStyle}>Current Password</label>
                <div style={{ position: "relative" }}>
                  <input 
                    type={showCurrent ? "text" : "password"} 
                    required 
                    placeholder="Enter current password"
                    value={currentPassword} 
                    onChange={e => setCurrentPassword(e.target.value)} 
                    style={{ ...inputStyle, paddingRight: "2.5rem" }}
                  />
                  <button 
                    type="button" 
                    onClick={() => setShowCurrent(!showCurrent)}
                    style={eyeToggleStyle}
                    title={showCurrent ? "Hide password" : "Show password"}
                  >
                    {showCurrent ? "👁️" : "🙈"}
                  </button>
                </div>
              </div>

              {/* New Password Field */}
              <div style={{ marginBottom: "1rem" }}>
                <label style={labelStyle}>New Password</label>
                <div style={{ position: "relative" }}>
                  <input 
                    type={showNew ? "text" : "password"} 
                    required 
                    placeholder="Minimum 8 characters"
                    value={newPassword} 
                    onChange={e => setNewPassword(e.target.value)} 
                    style={{ ...inputStyle, paddingRight: "2.5rem" }}
                  />
                  <button 
                    type="button" 
                    onClick={() => setShowNew(!showNew)}
                    style={eyeToggleStyle}
                    title={showNew ? "Hide password" : "Show password"}
                  >
                    {showNew ? "👁️" : "🙈"}
                  </button>
                </div>
              </div>

              {/* Confirm Password Field */}
              <div style={{ marginBottom: "1.5rem" }}>
                <label style={labelStyle}>Confirm New Password</label>
                <div style={{ position: "relative" }}>
                  <input 
                    type={showConfirm ? "text" : "password"} 
                    required 
                    placeholder="Confirm new password"
                    value={confirmPassword} 
                    onChange={e => setConfirmPassword(e.target.value)} 
                    style={{ ...inputStyle, paddingRight: "2.5rem" }}
                  />
                  <button 
                    type="button" 
                    onClick={() => setShowConfirm(!showConfirm)}
                    style={eyeToggleStyle}
                    title={showConfirm ? "Hide password" : "Show password"}
                  >
                    {showConfirm ? "👁️" : "🙈"}
                  </button>
                </div>
              </div>

              {/* Password section actions */}
              <div className="profile-actions" style={{ display: "flex", gap: "0.5rem", borderTop: "1px solid var(--border)", paddingTop: "1rem", justifyContent: "flex-end" }}>
                <button 
                  type="button" 
                  onClick={handleClearPassword} 
                  className="btn-secondary"
                  disabled={isSavingPassword}
                  style={{ padding: "0.5rem 1rem", borderRadius: "6px", fontWeight: 600 }}
                >
                  Clear
                </button>
                <button 
                  type="submit" 
                  className="btn-primary"
                  disabled={isSavingPassword}
                  style={{ padding: "0.5rem 1rem", borderRadius: "6px" }}
                >
                  {isSavingPassword ? "Changing..." : "Change Password"}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

// Inline component layout styles
const labelStyle = {
  display: "block",
  marginBottom: "0.375rem",
  fontSize: "0.85rem",
  fontWeight: 600,
  color: "var(--foreground)"
};

const readOnlyLabelStyle = {
  display: "block",
  fontSize: "0.8rem",
  fontWeight: 600,
  color: "var(--foreground-muted)"
};

const readOnlyValStyle: React.CSSProperties = {
  fontSize: "0.9rem",
  fontWeight: 500,
  color: "var(--foreground)",
  marginTop: "0.25rem",
  wordBreak: "break-all"
};

const inputStyle = {
  width: "100%",
  padding: "0.625rem 0.875rem",
  borderRadius: "6px",
  border: "1px solid var(--border)",
  fontSize: "0.9rem",
  outline: "none"
};

const eyeToggleStyle: React.CSSProperties = {
  position: "absolute",
  right: "0.75rem",
  top: "50%",
  transform: "translateY(-50%)",
  background: "none",
  border: "none",
  cursor: "pointer",
  fontSize: "1.1rem",
  padding: 0,
  display: "flex",
  alignItems: "center"
};
