"use client";

import { InventoryDb, Item } from '@/lib/db';
import { useState, useMemo, useRef, useEffect, useCallback } from 'react';

export type ProductSelection = {
  group: string;
  product: string;
  model: string;
  itemId: string;
};

type Props = {
  db: InventoryDb;
  value: ProductSelection;
  onChange: (sel: ProductSelection) => void;
  isBasicUser?: boolean;
};

export default function ProductSelector({ db, value, onChange, isBasicUser }: Props) {
  const [searchQuery, setSearchQuery] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Autocomplete suggestions - search by model, product, or group
  const suggestions = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [];
    return db.items.filter(i =>
      i.model.toLowerCase().includes(q) ||
      i.product.toLowerCase().includes(q) ||
      i.group.toLowerCase().includes(q)
    ).slice(0, 15);
  }, [db, searchQuery]);

  const selectItem = useCallback((item: Item) => {
    setSearchQuery(item.model.trim());
    setShowSuggestions(false);
    setHighlightedIndex(0);
    onChange({
      group: item.group,
      product: item.product,
      model: item.model.trim(),
      itemId: item.id,
    });
  }, [onChange]);

  const clearSelection = () => {
    setSearchQuery('');
    setShowSuggestions(false);
    onChange({ group: '', product: '', model: '', itemId: '' });
    inputRef.current?.focus();
  };

  // Auto-select if exact match of model number
  useEffect(() => {
    if (!searchQuery.trim() || value.itemId) return;
    const exactMatch = db.items.find(i => i.model.toLowerCase() === searchQuery.trim().toLowerCase());
    if (exactMatch) {
      selectItem(exactMatch);
    }
  }, [searchQuery, db.items, value.itemId, selectItem]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!showSuggestions || suggestions.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex(i => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (suggestions[highlightedIndex]) selectItem(suggestions[highlightedIndex]);
    } else if (e.key === 'Escape') {
      setShowSuggestions(false);
    }
  };

  // Close suggestions on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const ptb = isBasicUser ? '0.875rem' : '0.625rem';
  const plr = isBasicUser ? '1rem' : '0.875rem';

  const inputStyle = {
    fontSize: isBasicUser ? '1rem' : '0.875rem',
    paddingTop: ptb,
    paddingBottom: ptb,
    paddingLeft: plr,
    paddingRight: value.itemId ? '2.5rem' : plr,
    width: '100%',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
      {/* Search input with autocomplete */}
      <div ref={wrapperRef} className="autocomplete-wrapper">
        <div style={{ position: 'relative' }}>
          <input
            ref={inputRef}
            type="text"
            placeholder="Search model number, product or group..."
            value={searchQuery}
            onChange={e => {
              const val = e.target.value;
              setSearchQuery(val);
              setShowSuggestions(!!val.trim());
              setHighlightedIndex(0);
              // If user clears input, reset selection
              if (!val.trim()) {
                onChange({ group: '', product: '', model: '', itemId: '' });
              }
            }}
            onFocus={() => {
              if (searchQuery.trim() && !value.itemId) setShowSuggestions(true);
            }}
            onKeyDown={handleKeyDown}
            style={inputStyle}
            autoComplete="off"
          />
          {/* Clear button */}
          {(searchQuery || value.itemId) && (
            <button
              type="button"
              onClick={clearSelection}
              style={{
                position: 'absolute',
                right: '0.625rem',
                top: '50%',
                transform: 'translateY(-50%)',
                background: 'none',
                border: 'none',
                color: '#94a3b8',
                cursor: 'pointer',
                fontSize: '1rem',
                display: 'flex',
                alignItems: 'center',
                padding: '0.25rem',
              }}
            >
              ✕
            </button>
          )}
        </div>

        {/* Suggestions dropdown */}
        {showSuggestions && suggestions.length > 0 && (
          <div className="autocomplete-list">
            {suggestions.map((item, idx) => (
              <div
                key={item.id}
                className={`autocomplete-item ${idx === highlightedIndex ? 'highlighted' : ''}`}
                onMouseDown={() => selectItem(item)}
                onMouseEnter={() => setHighlightedIndex(idx)}
              >
                <span className="autocomplete-item-model">{item.model.trim()}</span>
                <span className="autocomplete-item-sub">{item.group} › {item.product}</span>
              </div>
            ))}
          </div>
        )}

        {/* No results */}
        {showSuggestions && searchQuery.trim() && suggestions.length === 0 && (
          <div className="autocomplete-list">
            <div style={{ padding: '0.875rem', textAlign: 'center', color: 'var(--foreground-muted)', fontSize: '0.875rem' }}>
              No results for &quot;{searchQuery}&quot;
            </div>
          </div>
        )}
      </div>

      {/* Selected item confirmation chip */}
      {value.itemId && (
        <div style={{
          background: '#eff6ff',
          border: '1.5px solid #bfdbfe',
          borderRadius: 'var(--radius-sm)',
          padding: '0.5rem 0.875rem',
          display: 'flex',
          flexWrap: 'wrap',
          gap: '0.375rem',
          alignItems: 'center',
        }}>
          <span style={{ fontSize: '0.7rem', color: '#64748b' }}>✓ Selected:</span>
          <span style={{ fontWeight: 700, color: 'var(--primary)', fontSize: '0.85rem' }}>{value.model.trim()}</span>
          <span style={{ fontSize: '0.7rem', color: '#94a3b8' }}>({value.group} › {value.product})</span>
        </div>
      )}
    </div>
  );
}
