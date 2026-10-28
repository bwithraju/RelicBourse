// Formatting utilities for RelicBourse
// All money is handled as integer minor units (paise: 100 = ₹1.00)

import { MinorUnits } from '../types';

/**
 * Single source of truth for money formatting (minor units -> ₹ string).
 * Displays in Indian numbering system (e.g. ₹1,00,000.00).
 */
export function formatMoney(minor: MinorUnits | null | undefined, options?: { showPaisa?: boolean }): string {
  if (minor === null || minor === undefined || isNaN(minor)) {
    return '₹0.00';
  }

  const inr = minor / 100;
  const showDecimals = options?.showPaisa ?? true;

  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: showDecimals ? 2 : 0,
    maximumFractionDigits: showDecimals ? 2 : 0,
  }).format(inr);
}

/**
 * Format minor units as a number string with 2 decimals (e.g. "1,500.00") without currency symbol
 */
export function formatMinorAmount(minor: MinorUnits | null | undefined): string {
  if (minor === null || minor === undefined || isNaN(minor)) {
    return '0.00';
  }
  return (minor / 100).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/**
 * Parse an INR decimal string (e.g. "1500.50" or "1,500.50") into integer minor units (paise)
 */
export function parseToMinor(amountStr: string | number): MinorUnits {
  if (typeof amountStr === 'number') {
    return Math.round(amountStr * 100);
  }
  const cleaned = amountStr.replace(/[^0-9.]/g, '');
  const parsed = parseFloat(cleaned);
  if (isNaN(parsed) || parsed < 0) {
    return 0;
  }
  return Math.round(parsed * 100);
}

/**
 * Format timestamps for trade tables (HH:mm:ss.SSS or HH:mm:ss)
 */
export function formatTradeTime(isoString?: string): string {
  if (!isoString) return '--:--:--';
  const d = new Date(isoString);
  if (isNaN(d.getTime())) return '--:--:--';
  return d.toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

/**
 * Format datetime for history tables (DD MMM YYYY, HH:mm:ss)
 */
export function formatDateTime(isoString?: string): string {
  if (!isoString) return '---';
  const d = new Date(isoString);
  if (isNaN(d.getTime())) return '---';
  return d.toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}
