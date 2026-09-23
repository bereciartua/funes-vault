import { NextResponse } from "next/server";

import { serverEnv } from "../../../lib/server-env";

// Evaluated per request so prebuilt images report the runtime API origin
// (see app/api-url.ts for why the runtime alias exists).
export const dynamic = "force-dynamic";

export function GET() {
  const env = serverEnv();

  return NextResponse.json({
    status: "ok",
    service: "funes-vault-web",
    timestamp: new Date().toISOString(),
    ...(env.nodeEnv === "production" ? {} : { apiUrl: env.apiUrl })
  });
}
