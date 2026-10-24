import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import type { AuthUser, JwtPayload } from '../auth.types.js';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator.js';

// Registered globally (APP_GUARD): routes are protected unless marked @Public().
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context
      .switchToHttp()
      .getRequest<Request & { user?: AuthUser }>();
    const token = extractBearerToken(request.headers.authorization);
    if (!token) {
      throw new UnauthorizedException('Faça login para continuar');
    }

    try {
      const payload = await this.jwt.verifyAsync<JwtPayload>(token);
      request.user = { id: payload.sub, role: payload.role };
    } catch {
      throw new UnauthorizedException(
        'Sessão inválida ou expirada. Faça login novamente',
      );
    }
    return true;
  }
}

export function extractBearerToken(
  header: string | undefined,
): string | undefined {
  const [type, token] = header?.split(' ') ?? [];
  return type === 'Bearer' && token ? token : undefined;
}
