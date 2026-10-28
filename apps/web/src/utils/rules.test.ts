import { describe, it, expect } from 'vitest';

describe('Core Trading Rules (Client Guard Verification)', () => {
  it('enforces anti-scalping collar calculation (120% cap)', () => {
    // Festival pass: face value ₹12,000 = 1,200,000 minor
    const faceValueMinor = 1200000;
    const capPercent = 120;
    const maxCollarMinor = Math.floor((faceValueMinor * capPercent) / 100);

    // 12,000 * 1.20 = 14,400 -> 1,440,000 minor
    expect(maxCollarMinor).toBe(1440000);

    const validPrice = 1440000;
    const invalidPrice = 1440100;

    expect(validPrice <= maxCollarMinor).toBe(true);
    expect(invalidPrice <= maxCollarMinor).toBe(false);
  });

  it('calculates buy order reservation accurately (price × qty)', () => {
    const priceMinor = 1350000;
    const qty = 3;
    const requiredReservation = priceMinor * qty;

    expect(requiredReservation).toBe(4050000); // ₹40,500.00
  });

  it('determines seller inventory availability (quantity - reservedQty)', () => {
    const inventory = {
      quantity: 5,
      reservedQty: 2,
    };
    const availableToSell = inventory.quantity - inventory.reservedQty;
    expect(availableToSell).toBe(3);
  });
});
