import { createParamDecorator, ExecutionContext } from "@nestjs/common";

import type { FunesRequest } from "./auth.types.js";

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext) => {
    const request = context.switchToHttp().getRequest<FunesRequest>();

    return request.user;
  }
);
