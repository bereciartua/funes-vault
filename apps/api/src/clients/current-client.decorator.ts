import type { Client } from "@funes-vault/shared";
import { createParamDecorator, ExecutionContext } from "@nestjs/common";

type RequestWithClient = {
  client?: Client;
  clientUserId?: string;
};

export const CurrentClient = createParamDecorator(
  (_data: unknown, context: ExecutionContext) => {
    const request = context.switchToHttp().getRequest<RequestWithClient>();

    return request.client;
  }
);

export const CurrentClientUserId = createParamDecorator(
  (_data: unknown, context: ExecutionContext) => {
    const request = context.switchToHttp().getRequest<RequestWithClient>();

    return request.clientUserId;
  }
);
