"use client";

import React, { createContext, useContext, useState, useEffect } from 'react';
import { apiFetch } from '@/lib/apiFetch';
import { useAuth } from './AuthProvider';
import en from '../locales/en.json';
import ta from '../locales/ta.json';
import hi from '../locales/hi.json';

const dictionaries = { en, ta, hi };

export type Language = 'en' | 'ta' | 'hi';

type LanguageContextType = {
  language: Language;
  t: (key: string) => string;
  changeLanguage: (lang: Language) => Promise<void>;
  terminology: Record<string, string>;
  refreshTerminology: () => Promise<void>;
};

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [language, setLanguage] = useState<Language>('en');
  const [terminology, setTerminology] = useState<Record<string, string>>({});

  const fetchConfig = async () => {
    try {
      const res = await apiFetch('/settings');
      if (res.ok) {
        const json = await res.json();
        if (json.success && json.data?.business_configuration?.terminology) {
          setTerminology(json.data.business_configuration.terminology);
        }
      }
    } catch (e) {
      console.error('Failed to load terminology config', e);
    }
  };

  useEffect(() => {
    // 1. Load initial language from localStorage or User Profile
    const localLang = localStorage.getItem('language') as Language;
    if (localLang && ['en', 'ta', 'hi'].includes(localLang)) {
      setLanguage(localLang);
    }

    const userStr = localStorage.getItem('user');
    if (userStr) {
      try {
        const parsed = JSON.parse(userStr);
        if (parsed.language && ['en', 'ta', 'hi'].includes(parsed.language)) {
          setLanguage(parsed.language);
          localStorage.setItem('language', parsed.language);
        }
      } catch (e) {}
    }
  }, []);

  useEffect(() => {
    if (user) {
      fetchConfig();
    } else {
      setTerminology({});
    }
  }, [user]);

  const changeLanguage = async (newLang: Language) => {
    setLanguage(newLang);
    localStorage.setItem('language', newLang);

    // Update user profile cache
    const userStr = localStorage.getItem('user');
    if (userStr) {
      try {
        const parsed = JSON.parse(userStr);
        parsed.language = newLang;
        localStorage.setItem('user', JSON.stringify(parsed));
      } catch (e) {}
    }

    // Attempt to save preference in database
    try {
      await apiFetch('/profile/language', {
        method: 'PUT',
        body: JSON.stringify({ language: newLang })
      });
    } catch (e) {
      console.error('Failed to save language preference on backend', e);
    }
  };

  const t = (path: string): string => {
    // 1. Terminology translation overrides checks
    // We map keys like "nav.adjustment" -> terminology.ADJUSTMENT if defined
    if (path === 'nav.adjustment' || path === 'labels.adjustment') {
      if (terminology.ADJUSTMENT) return terminology.ADJUSTMENT;
    }
    if (path === 'nav.transfer' || path === 'labels.transfer') {
      if (terminology.TRANSFER) return terminology.TRANSFER;
    }
    if (path === 'labels.narration') {
      if (terminology.NARRATION) return terminology.NARRATION;
    }
    if (path === 'labels.warehouse') {
      if (terminology.WAREHOUSE) return terminology.WAREHOUSE;
    }
    if (path === 'labels.stock') {
      if (terminology.STOCK) return terminology.STOCK;
    }

    // 2. Normal key walk down translation dictionaries
    const keys = path.split('.');
    let current: any = dictionaries[language] || dictionaries['en'];

    for (const key of keys) {
      if (current && current[key] !== undefined) {
        current = current[key];
      } else {
        // Fallback to English dictionary if key is missing in Tamil or Hindi
        let enFall: any = dictionaries['en'];
        for (const enKey of keys) {
          if (enFall && enFall[enKey] !== undefined) {
            enFall = enFall[enKey];
          } else {
            return path; // Return the path key as fallback
          }
        }
        return enFall;
      }
    }

    return typeof current === 'string' ? current : path;
  };

  return (
    <LanguageContext.Provider value={{ language, t, changeLanguage, terminology, refreshTerminology: fetchConfig }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useLanguage must be used within LanguageProvider');
  return ctx;
}
