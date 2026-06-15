"use client";

import { useState, useEffect } from "react";
import type { MonogramConfig, MonogramFont, MonogramStyle, CartItemAddon } from "@/types/addons";

interface MonogramAddonProps {
  config: MonogramConfig;
  onChange: (addon: CartItemAddon | null) => void;
}

const FONT_CSS: Record<MonogramFont, string> = {
  'Anonymous Pro': 'var(--font-anonymous-pro)',
  'Happy Monkey': 'var(--font-happy-monkey)',
  'Oregano': 'var(--font-oregano)',
};

export default function MonogramAddon({ config, onChange }: MonogramAddonProps) {
  const [enabled, setEnabled] = useState(false);
  const [style, setStyle] = useState<MonogramStyle>('INITIALS');
  const [font, setFont] = useState<MonogramFont>(config.fonts[0]);
  const [text, setText] = useState('');

  // Sanitize text: strip HTML tags and trim
  const sanitizeText = (input: string): string => {
    return input.replace(/<[^>]*>/g, '').trim();
  };

  // Notify parent on any change
  useEffect(() => {
    if (!enabled || text.trim().length === 0) {
      onChange(null);
    } else {
      onChange({
        type: 'LASER_MONOGRAM',
        data: {
          text: sanitizeText(text),
          font,
          style,
        },
      });
    }
  }, [enabled, text, font, style, onChange]);

  const handleTextChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    // Sanitize on change
    const sanitized = value.replace(/<[^>]*>/g, '');
    if (sanitized.length <= config.maxChars) {
      setText(sanitized);
    }
  };

  const placeholder = style === 'INITIALS' ? 'e.g. A.K.' : 'e.g. Anna Kool';

  return (
    <div
      style={{
        border: '1px solid #e0d5c5',
        borderRadius: 12,
        padding: 16,
        background: enabled ? '#fffbf5' : '#fff',
        transition: 'background 0.2s ease',
      }}
    >
      {/* Toggle row */}
      <label
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          cursor: 'pointer',
          userSelect: 'none',
        }}
      >
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
          style={{
            width: 18,
            height: 18,
            accentColor: '#8B6914',
            cursor: 'pointer',
          }}
        />
        <span
          style={{
            fontFamily: "'Inter', sans-serif",
            fontSize: 14,
            fontWeight: 500,
            color: '#3a2e24',
          }}
        >
          Add a free laser monogram
        </span>
      </label>

      {/* Expanded content */}
      <div
        style={{
          maxHeight: enabled ? 400 : 0,
          overflow: 'hidden',
          transition: 'max-height 0.3s ease',
          marginTop: enabled ? 16 : 0,
        }}
      >
        {/* Style selector */}
        <div style={{ marginBottom: 16 }}>
          <p
            style={{
              fontFamily: "'Inter', sans-serif",
              fontSize: 12,
              fontWeight: 500,
              color: '#6b5540',
              marginBottom: 8,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
            }}
          >
            Style
          </p>
          <div style={{ display: 'flex', gap: 8 }}>
            {(['INITIALS', 'FULL_NAME'] as MonogramStyle[]).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setStyle(s)}
                style={{
                  padding: '8px 16px',
                  borderRadius: 20,
                  border: style === s ? '2px solid #8B6914' : '1px solid #d5cdc0',
                  background: style === s ? '#fdf5ea' : '#fff',
                  color: style === s ? '#8B6914' : '#6b5540',
                  fontFamily: "'Inter', sans-serif",
                  fontSize: 13,
                  fontWeight: style === s ? 600 : 400,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                {s === 'INITIALS' ? 'Initials' : 'Full Name'}
              </button>
            ))}
          </div>
        </div>

        {/* Font selector */}
        <div style={{ marginBottom: 16 }}>
          <p
            style={{
              fontFamily: "'Inter', sans-serif",
              fontSize: 12,
              fontWeight: 500,
              color: '#6b5540',
              marginBottom: 8,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
            }}
          >
            Font
          </p>
          <div style={{ display: 'flex', gap: 10 }}>
            {config.fonts.map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFont(f)}
                style={{
                  flex: 1,
                  padding: '12px 8px',
                  borderRadius: 8,
                  border: font === f ? '2px solid #C9A84C' : '1px solid #d5cdc0',
                  background: font === f ? '#fdf5ea' : '#fff',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                  boxShadow: font === f ? '0 0 0 2px rgba(201, 168, 76, 0.2)' : 'none',
                }}
              >
                <span
                  style={{
                    display: 'block',
                    fontFamily: FONT_CSS[f],
                    fontSize: 24,
                    color: '#3a2e24',
                    marginBottom: 4,
                  }}
                >
                  Aa
                </span>
                <span
                  style={{
                    display: 'block',
                    fontFamily: "'Inter', sans-serif",
                    fontSize: 10,
                    color: font === f ? '#8B6914' : '#9a876e',
                    fontWeight: font === f ? 600 : 400,
                  }}
                >
                  {f}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Text input */}
        <div style={{ marginBottom: 16 }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 8,
            }}
          >
            <label
              htmlFor="monogram-text"
              style={{
                fontFamily: "'Inter', sans-serif",
                fontSize: 12,
                fontWeight: 500,
                color: '#6b5540',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
              }}
            >
              Your text
            </label>
            <span
              style={{
                fontFamily: "'Inter', sans-serif",
                fontSize: 11,
                color: text.length >= config.maxChars ? '#c0392b' : '#9a876e',
              }}
            >
              {text.length} / {config.maxChars}
            </span>
          </div>
          <input
            id="monogram-text"
            type="text"
            value={text}
            onChange={handleTextChange}
            placeholder={placeholder}
            maxLength={config.maxChars}
            style={{
              width: '100%',
              padding: '12px 14px',
              border: '1px solid #d5cdc0',
              borderRadius: 8,
              fontFamily: "'Inter', sans-serif",
              fontSize: 14,
              color: '#3a2e24',
              outline: 'none',
              transition: 'border-color 0.15s ease',
              boxSizing: 'border-box',
            }}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = '#8B6914';
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = '#d5cdc0';
            }}
          />
        </div>

        {/* Live preview */}
        {text.trim().length > 0 && (
          <div
            style={{
              padding: '16px',
              background: '#fff',
              border: '1px dashed #d5cdc0',
              borderRadius: 8,
              textAlign: 'center',
            }}
          >
            <p
              style={{
                fontFamily: "'Inter', sans-serif",
                fontSize: 10,
                fontWeight: 500,
                color: '#9a876e',
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                marginBottom: 8,
              }}
            >
              Preview
            </p>
            <p
              style={{
                fontFamily: FONT_CSS[font],
                fontSize: 28,
                color: '#3a2e24',
                margin: 0,
                wordBreak: 'break-word',
              }}
            >
              {sanitizeText(text)}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
