import { extractBearerToken } from './jwt-auth.guard.js';

describe('extractBearerToken', () => {
  it('extracts the token from a Bearer header', () => {
    expect(extractBearerToken('Bearer abc.def.ghi')).toBe('abc.def.ghi');
  });

  it.each([undefined, '', 'Bearer', 'Basic abc', 'abc.def.ghi'])(
    'returns undefined for %j',
    (header) => {
      expect(extractBearerToken(header)).toBeUndefined();
    },
  );
});
