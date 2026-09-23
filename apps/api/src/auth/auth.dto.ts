import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class AuthUserDto {
  @ApiProperty({ example: "cmqvt0v580000xeg7jgy7v1u3" })
  id!: string;

  @ApiProperty({ example: "demo@funes-vault.local" })
  email!: string;

  @ApiPropertyNullable({ example: "Demo User" })
  displayName!: string | null;

  @ApiProperty({ enum: ["USER", "ADMIN", "OWNER"], example: "USER" })
  role!: "USER" | "ADMIN" | "OWNER";
}

export class AuthResponseDto {
  @ApiProperty({ type: AuthUserDto })
  user!: AuthUserDto;
}

export class UpdateProfileRequestDto {
  @ApiPropertyNullableOptional({ example: "Demo User" })
  displayName?: string | null;
}

export class DeleteAccountRequestDto {
  @ApiProperty({ enum: ["DELETE"] })
  confirmation!: "DELETE";
}

export class LogoutResponseDto {
  @ApiProperty({ example: true })
  ok!: boolean;
}

function ApiPropertyNullable(options: Parameters<typeof ApiProperty>[0]) {
  return ApiProperty({ ...options, nullable: true });
}

function ApiPropertyNullableOptional(
  options: Parameters<typeof ApiProperty>[0]
) {
  return ApiPropertyOptional({ ...options, nullable: true });
}

export class LoginOptionsDto {
  @ApiProperty({ example: false })
  demoLoginEnabled!: boolean;
}
