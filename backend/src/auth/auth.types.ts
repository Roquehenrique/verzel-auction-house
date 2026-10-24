import type { Role } from '../generated/prisma/enums.js';

// Claims stored in the JWT. Kept minimal: name/email are read from the database.
export interface JwtPayload {
  sub: string; // user id
  role: Role;
}

// What guards attach to request.user after validating the token.
export interface AuthUser {
  id: string;
  role: Role;
}

// User data safe to send to the client (never the password hash).
export interface PublicUser {
  id: string;
  name: string;
  email: string;
  role: Role;
}
