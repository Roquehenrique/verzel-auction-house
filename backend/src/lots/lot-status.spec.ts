import { getLotStatus } from './lot-status.js';

describe('getLotStatus', () => {
  const lot = {
    startsAt: new Date('2026-01-01T10:00:00.000Z'),
    endsAt: new Date('2026-01-01T12:00:00.000Z'),
    cancelledAt: null,
  };
  const at = (iso: string) => new Date(iso);

  it('is SCHEDULED before the start', () => {
    expect(getLotStatus(lot, at('2026-01-01T09:59:59.999Z'))).toBe('SCHEDULED');
  });

  it('is LIVE from the start (inclusive)', () => {
    expect(getLotStatus(lot, at('2026-01-01T10:00:00.000Z'))).toBe('LIVE');
    expect(getLotStatus(lot, at('2026-01-01T11:59:59.999Z'))).toBe('LIVE');
  });

  it('is ENDED at the end time (exclusive)', () => {
    expect(getLotStatus(lot, at('2026-01-01T12:00:00.000Z'))).toBe('ENDED');
  });

  it('is CANCELLED regardless of time', () => {
    const cancelled = { ...lot, cancelledAt: at('2026-01-01T09:00:00.000Z') };
    expect(getLotStatus(cancelled, at('2026-01-01T11:00:00.000Z'))).toBe(
      'CANCELLED',
    );
  });
});
