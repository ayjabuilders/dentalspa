import { ArgumentsHost, Catch, ExceptionFilter, HttpException } from '@nestjs/common';
import type { Response } from 'express';
const statuses = { scheduling_disabled:503, unauthenticated:401, invalid_request:400, forbidden:403, resource_not_found:404, hold_not_found:404, resource_conflict:409, idempotency_conflict:409, hold_expired:409, internal_error:500 } as const;
export type SchedulingErrorCode = keyof typeof statuses;
export class SchedulingError extends HttpException {
  constructor(readonly code:SchedulingErrorCode) { super({statusCode:statuses[code],code,message:code},statuses[code]); }
}
export function databaseError(error:{code?:string}):never {
  const codes:Record<string,SchedulingErrorCode>={ '28000':'unauthenticated',PGRST301:'unauthenticated',PGRST302:'unauthenticated','42501':'forbidden',PT503:'scheduling_disabled','22023':'invalid_request','22P02':'invalid_request','22007':'invalid_request','22008':'invalid_request',SH404:'resource_not_found',SH405:'hold_not_found',SH409:'resource_conflict','23P01':'resource_conflict',SH410:'idempotency_conflict',SH411:'hold_expired' };
  throw new SchedulingError(codes[error.code??'']??'internal_error');
}
@Catch()
export class SchedulingExceptionFilter implements ExceptionFilter {
  catch(error:unknown,host:ArgumentsHost) {
    const status=error instanceof HttpException?error.getStatus():500;
    const safe=error instanceof SchedulingError?error:new SchedulingError(status===401?'unauthenticated':status===403?'forbidden':status===400?'invalid_request':'internal_error');
    host.switchToHttp().getResponse<Response>().setHeader('Cache-Control','no-store').status(safe.getStatus()).json(safe.getResponse());
  }
}
