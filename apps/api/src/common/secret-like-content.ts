import { BadRequestException } from "@nestjs/common";

type SecretScanInput = {
  title?: string;
  body?: string;
  evidence?: string | null;
  sourceMetadata?: Record<string, unknown>;
};

const secretPatterns: Array<{ name: string; pattern: RegExp }> = [
  {
    name: "private_key",
    pattern: /-----BEGIN (?:RSA |DSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/i
  },
  {
    name: "aws_access_key",
    pattern: /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/
  },
  {
    name: "openai_api_key",
    pattern: /\bsk-[A-Za-z0-9_-]{20,}\b/
  },
  {
    name: "github_token",
    pattern: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]{20,}\b/
  },
  {
    name: "jwt",
    pattern: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/
  },
  {
    name: "assigned_secret",
    pattern:
      /\b(?:api[_-]?key|access[_-]?token|auth[_-]?token|client[_-]?secret|password)\b\s*[:=]\s*["']?[^"'\s]{12,}/i
  }
];

export function detectSecretLikeContent(input: SecretScanInput) {
  const text = [
    input.title,
    input.body,
    input.evidence,
    input.sourceMetadata ? JSON.stringify(input.sourceMetadata) : null
  ]
    .filter(Boolean)
    .join("\n");

  return secretPatterns
    .filter(({ pattern }) => pattern.test(text))
    .map(({ name }) => name);
}

export function assertNoSecretLikeContent(input: SecretScanInput) {
  const findings = detectSecretLikeContent(input);

  if (findings.length > 0) {
    throw new BadRequestException({
      message:
        "Memory content appears to contain secret-like material and was not stored.",
      findings
    });
  }
}
