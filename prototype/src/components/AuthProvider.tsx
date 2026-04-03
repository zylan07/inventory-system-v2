"use client";

import React, { createContext, useContext, useEffect, useState } from 'react';
import { UserRole } from '@/lib/db';
import { useRouter, usePathname } from 'next/navigation';

type SessionUser = {
  id: number;
  email: string;
  role: UserRole;
  managedProjects?: number[];
};

type AuthContextType = {
  userRole: UserRole | null;
  user: SessionUser | null;
  login: (token: string, user: SessionUser) => void;
  logout: () => void;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [userRole, setUserRole] = useState<UserRole | null>(null);
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const token = localStorage.getItem('token');
    const userStr = localStorage.getItem('user');

    if (token && userStr) {
      try {
        const parsedUser = JSON.parse(userStr);
        const roleMap: Record<string, UserRole> = {
  admin: 'Admin',
  manager: 'Manager',
  'basic user': 'Basic User'
};

const normalizedRole =
  roleMap[parsedUser.role?.toLowerCase()] || parsedUser.role;

setUser({ ...parsedUser, role: normalizedRole });
setUserRole(normalizedRole);
      } catch (e) {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
      }
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    if (!loading) {
      const token = localStorage.getItem('token');
      if (!token && pathname !== '/') {
        router.push('/');
      }
    }
  }, [loading, pathname, router, userRole]);

  const login = (token: string, userData: SessionUser) => {
  const roleMap: Record<string, UserRole> = {
    admin: 'Admin',
    manager: 'Manager',
    'basic user': 'Basic User'
  };

  const normalizedRole =
    roleMap[userData.role?.toLowerCase()] || 'Basic User';

  const updatedUser = {
    ...userData,
    role: normalizedRole
  };

  localStorage.setItem('token', token);
  localStorage.setItem('user', JSON.stringify(updatedUser));

  setUser(updatedUser);
  setUserRole(normalizedRole);
};

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setUser(null);
    setUserRole(null);
    router.push('/');
  };

  if(loading) return <div style={{height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center'}}>Loading App...</div>;

  return (
    <AuthContext.Provider value={{ userRole, user, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if(!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
};
