'use client';

import React, { useRef, useEffect, useCallback } from 'react';

interface Props {
  ticks: number[];
  height?: number;
  visible?: boolean;
}

export function TickChart({ ticks, height = 180, visible = true }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !visible || ticks.length < 2) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.scale(dpr, dpr);

    const min = Math.min(...ticks);
    const max = Math.max(...ticks);
    const range = max - min || 1;
    const padding = 8;

    ctx.clearRect(0, 0, w, h);

    // Grid lines
    ctx.strokeStyle = '#2a2a2a';
    ctx.lineWidth = 0.5;
    for (let i = 0; i < 4; i++) {
      const y = padding + (h - padding * 2) * (i / 4);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    // Price labels
    ctx.fillStyle = '#555';
    ctx.font = '9px monospace';
    ctx.textAlign = 'right';
    for (let i = 0; i < 4; i++) {
      const y = padding + (h - padding * 2) * (i / 4);
      const val = max - range * (i / 4);
      ctx.fillText(val.toFixed(2), w - 4, y - 2);
    }

    // Line chart
    const slice = ticks.slice(-100);
    const step = (w - padding * 2) / Math.max(slice.length - 1, 1);

    ctx.beginPath();
    ctx.strokeStyle = '#ff444f';
    ctx.lineWidth = 2;
    for (let i = 0; i < slice.length; i++) {
      const x = padding + i * step;
      const y = padding + (h - padding * 2) * (1 - (slice[i] - min) / range);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Current value label
    const last = slice[slice.length - 1];
    const lastY = padding + (h - padding * 2) * (1 - (last - min) / range);
    ctx.fillStyle = '#ff444f';
    ctx.font = 'bold 10px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(last.toFixed(2), 4, lastY - 4);

    // Fill area under the line
    ctx.lineTo(padding + (slice.length - 1) * step, h - padding);
    ctx.lineTo(padding, h - padding);
    ctx.closePath();
    ctx.fillStyle = 'rgba(255,68,79,0.08)';
    ctx.fill();
  }, [ticks, height, visible]);

  useEffect(() => { draw(); }, [draw]);

  return (
    <canvas
      ref={canvasRef}
      style={{ width: '100%', height, display: visible ? 'block' : 'none' }}
    />
  );
}
