import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { JwtPayload, PublicUser } from './auth.types.js';
import { LoginDto } from './dto/login.dto.js';
import { RegisterDto } from './dto/register.dto.js';
import { hashPassword, verifyPassword } from './password.js';

const INVALID_CREDENTIALS = 'E-mail ou senha inválidos';

const publicUserSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
} satisfies Prisma.UserSelect;

export interface AuthResponse {
  accessToken: string;
  user: PublicUser;
}

@Injectable()
export class AuthService {
  // Hash compared against when the e-mail does not exist, so a login attempt
  // takes the same time whether or not the account exists (no user enumeration).
  private dummyHash: Promise<string> | undefined;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async register(dto: RegisterDto): Promise<AuthResponse> {
    const passwordHash = await hashPassword(dto.password);

    try {
      const user = await this.prisma.user.create({
        data: {
          name: dto.name,
          email: dto.email,
          passwordHash,
          role: dto.role,
          wallet: { create: {} }, // every user has a wallet (auctioneers receive sales)
        },
        select: publicUserSelect,
      });
      return this.buildResponse(user);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002' // unique constraint (email)
      ) {
        throw new ConflictException('Este e-mail já está cadastrado');
      }
      throw error;
    }
  }

  async login(dto: LoginDto): Promise<AuthResponse> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
      select: { ...publicUserSelect, passwordHash: true },
    });

    if (!user) {
      await verifyPassword(dto.password, await this.getDummyHash());
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }

    const valid = await verifyPassword(dto.password, user.passwordHash);
    if (!valid) throw new UnauthorizedException(INVALID_CREDENTIALS);

    const { passwordHash: _, ...publicUser } = user;
    return this.buildResponse(publicUser);
  }

  async me(userId: string): Promise<PublicUser> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: publicUserSelect,
    });
    // Valid token but the account no longer exists.
    if (!user) throw new UnauthorizedException('Sessão inválida. Faça login novamente');
    return user;
  }

  private async buildResponse(user: PublicUser): Promise<AuthResponse> {
    const payload: JwtPayload = { sub: user.id, role: user.role };
    return { accessToken: await this.jwt.signAsync(payload), user };
  }

  private getDummyHash(): Promise<string> {
    this.dummyHash ??= hashPassword('dummy-password-for-timing');
    return this.dummyHash;
  }
}
