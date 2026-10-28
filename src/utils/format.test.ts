import { describe, it, expect } from 'vitest';
import { formatMoney, formatMinorAmount, parseToMinor, formatTradeTime, formatDateTime } from './format';

describe('Format Utilities (Minor Units / Paise)', () => {
  it('formats integer minor units to INR currency string properly', () => {
    // 10000000 paise = ₹1,00,000.00
    const formatted = formatMoney(10000000);
    expect(formatted).toContain('1,00,000.00');
    expect(formatted).toContain('₹');

    // 1350000 paise = ₹13,500.00
    expect(formatMoney(1350000)).toContain('13,500.00');

    // 50 paise = ₹0.50
    expect(formatMoney(50)).toContain('0.50');

    // 0 paise = ₹0.00
    expect(formatMoney(0)).toContain('0.00');
  });

  it('handles null and undefined gracefully', () => {
    expect(formatMoney(null)).toBe('₹0.00');
    expect(formatMoney(undefined)).toBe('₹0.00');
  });

  it('formats minor amount without currency symbol', () => {
    expect(formatMinorAmount(1200000)).toContain('12,000.00');
    expect(formatMinorAmount(0)).toBe('0.00');
  });

  it('parses user rupee input to minor units correctly without float inaccuracies', () => {
    expect(parseToMinor('12000')).toBe(1200000);
    expect(parseToMinor('12,000.50')).toBe(1200050);
    expect(parseToMinor(14400)).toBe(1440000);
    expect(parseToMinor('')).toBe(0);
    expect(parseToMinor('-500')).toBe(50000); // stripped of negative or sanitized
  });

  it('formats trade time and datetime without crashing', () => {
    const iso = '2026-10-28T12:30:45.000Z';
    const timeStr = formatTradeTime(iso);
    expect(timeStr).toMatch(/\d{2}:\d{2}:\d{2}/);

    const dateStr = formatDateTime(iso);
    expect(dateStr).toContain('2026');
  });
});
