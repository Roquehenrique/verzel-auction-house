import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { extractBearerToken, JwtAuthGuard } from './jwt-auth.guard.js';

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

describe('JwtAuthGuard', () => {
  it('lets WebSocket messages through (sockets are authenticated in the handshake)', async () => {
    const guard = new JwtAuthGuard(new JwtService(), new Reflector());
    const context = { getType: () => 'ws' } as unknown as ExecutionContext;
    await expect(guard.canActivate(context)).resolves.toBe(true);
  });
});
