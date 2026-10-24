import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

// Every route requires a valid JWT by default; @Public() opts a route out
// (showcase, audit page, shared receipt, login...).
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
