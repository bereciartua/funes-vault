import {
  type AuditTransport,
  mcpTransportHeaderName,
  toAuditTransport
} from "@funes-vault/shared";
import { createParamDecorator, ExecutionContext } from "@nestjs/common";

type RequestWithHeaders = {
  headers: Record<string, string | string[] | undefined>;
};

export const RequestAuditTransport = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuditTransport => {
    const request = context.switchToHttp().getRequest<RequestWithHeaders>();
    const header = request.headers[mcpTransportHeaderName];

    return toAuditTransport(Array.isArray(header) ? header[0] : header);
  }
);
