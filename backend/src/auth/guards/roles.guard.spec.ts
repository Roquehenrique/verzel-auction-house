import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Role } from '../../generated/prisma/enums.js';
import { RolesGuard } from './roles.guard.js';

function contextFor(user?: { id: string; role: Role }): ExecutionContext {
  return {
    getHandler: () => undefined,
    getClass: () => undefined,
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

describe('RolesGuard', () => {
  const reflector = new Reflector();
  const guard = new RolesGuard(reflector);

  afterEach(() => vi.restoreAllMocks());

  it('allows any authenticated user when no role is required', () => {
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);
    expect(guard.canActivate(contextFor({ id: '1', role: 'BIDDER' }))).toBe(true);
  });

  it('allows a user with the required role', () => {
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['AUCTIONEER']);
    expect(guard.canActivate(contextFor({ id: '1', role: 'AUCTIONEER' }))).toBe(true);
  });

  it('blocks an auctioneer from a bidder-only route (auctioneers cannot bid)', () => {
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['BIDDER']);
    expect(() => guard.canActivate(contextFor({ id: '1', role: 'AUCTIONEER' }))).toThrow(
      new ForbiddenException('Ação permitida apenas para licitantes'),
    );
  });

  it('blocks a request without user on a role-restricted route', () => {
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['BIDDER']);
    expect(() => guard.canActivate(contextFor(undefined))).toThrow(ForbiddenException);
  });
});
