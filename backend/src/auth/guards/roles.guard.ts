import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import type { Role } from '../../generated/prisma/enums.js';
import type { AuthUser } from '../auth.types.js';
import { ROLES_KEY } from '../decorators/roles.decorator.js';

const ROLE_LABELS: Record<Role, string> = {
  AUCTIONEER: 'leiloeiros',
  BIDDER: 'licitantes',
};

// Runs after JwtAuthGuard, so request.user is already set on protected routes.
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<Role[] | undefined>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!roles || roles.length === 0) return true;

    const user = context
      .switchToHttp()
      .getRequest<Request & { user?: AuthUser }>().user;
    if (user && roles.includes(user.role)) return true;

    const allowed = roles.map((role) => ROLE_LABELS[role]).join(' ou ');
    throw new ForbiddenException(`Ação permitida apenas para ${allowed}`);
  }
}
