"use client";

import ProfileClient from "./ProfileClient";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/apiFetch";

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

export default function ProfilePage() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const fetchProfile = async () => {
    try {
      const res = await apiFetch('/profile');
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.data) {
          setProfile(data.data);
          setError(false);
        } else {
          setError(true);
        }
      } else {
        setError(true);
      }
    } catch (err) {
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProfile();
  }, []);

  if (loading) {
    return <div style={{ padding: '2rem', textAlign: 'center' }}>Loading user profile...</div>;
  }

  if (error || !profile) {
    return <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--danger)' }}>Error loading profile. Please check authorization.</div>;
  }

  return <ProfileClient initialProfile={profile} refresh={fetchProfile} />;
}
