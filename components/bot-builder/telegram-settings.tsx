'use client';

import React, { useState, useEffect } from 'react';

const TG_TOKEN_KEY = 'investpal_telegram_token';
const TG_CHAT_KEY = 'investpal_telegram_chatid';

interface Props {
  open: boolean;
  onClose: () => void;
}

export function TelegramSettings({ open, onClose }: Props) {
  const [token, setToken] = useState('');
  const [chatId, setChatId] = useState('');

  useEffect(() => {
    if (open) {
      setToken(localStorage.getItem(TG_TOKEN_KEY) || '');
      setChatId(localStorage.getItem(TG_CHAT_KEY) || '');
    }
  }, [open]);

  const save = () => {
    localStorage.setItem(TG_TOKEN_KEY, token);
    localStorage.setItem(TG_CHAT_KEY, chatId);
    onClose();
  };

  const test = async () => {
    if (!token || !chatId) return;
    try {
      const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text: '✅ InvestPal Bot connected!' }),
      });
      const d = await r.json();
      alert(d.ok ? 'Telegram message sent!' : `Error: ${d.description}`);
    } catch (e: any) {
      alert(`Connection failed: ${e.message}`);
    }
  };

  if (!open) return null;

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
    }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        background: '#1c1c1c', border: '1px solid #2a2a2a', borderRadius: 12, padding: 24, width: 380,
        color: '#e4e4e7',
      }}>
        <h2 style={{ fontSize: 14, fontWeight: 700, marginBottom: 4, color: '#ff444f' }}>Telegram Notification</h2>
        <p style={{ fontSize: 11, color: '#71717a', marginBottom: 16 }}>
          Configure Telegram bot credentials for the <code style={{ color: '#ff444f' }}>notify_telegram</code> block.
          Get a token from <a href="https://t.me/BotFather" target="_blank" style={{ color: '#3b82f6' }}>@BotFather</a>.
        </p>

        <label style={{ fontSize: 11, fontWeight: 600, color: '#a1a1aa', display: 'block', marginBottom: 4 }}>Bot Token</label>
        <input value={token} onChange={e => setToken(e.target.value)} placeholder="123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11"
          style={{
            width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #2a2a2a',
            background: '#151717', color: '#e4e4e7', fontSize: 12, fontFamily: 'monospace', marginBottom: 12,
            outline: 'none',
          }}/>

        <label style={{ fontSize: 11, fontWeight: 600, color: '#a1a1aa', display: 'block', marginBottom: 4 }}>Chat ID</label>
        <input value={chatId} onChange={e => setChatId(e.target.value)} placeholder="-1001234567890"
          style={{
            width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #2a2a2a',
            background: '#151717', color: '#e4e4e7', fontSize: 12, fontFamily: 'monospace', marginBottom: 20,
            outline: 'none',
          }}/>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={test}
            style={{
              padding: '8px 16px', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer',
              background: '#2a2a2a', color: '#a1a1aa', border: 'none',
            }}>Test</button>
          <button onClick={onClose}
            style={{
              padding: '8px 16px', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer',
              background: '#2a2a2a', color: '#a1a1aa', border: 'none',
            }}>Cancel</button>
          <button onClick={save}
            style={{
              padding: '8px 16px', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer',
              background: '#ff444f', color: '#fff', border: 'none',
            }}>Save</button>
        </div>
      </div>
    </div>
  );
}
