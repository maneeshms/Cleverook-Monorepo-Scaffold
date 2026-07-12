import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class RegisterDto {
  @ApiProperty({ example: 'builder@example.com' })
  @IsEmail()
  @MaxLength(320)
  email: string;

  @ApiProperty({ example: 'Str0ng!Pass', minLength: 8 })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  @Matches(/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9])/, {
    message: 'Password must include upper, lower, number, and special character',
  })
  password: string;

  @ApiProperty({ required: false, example: 'Alex Builder' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  displayName?: string;
}

export class LoginDto {
  @ApiProperty({ example: 'builder@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'Str0ng!Pass' })
  @IsString()
  password: string;
}

export class RefreshDto {
  @ApiProperty({ description: 'Opaque refresh token from the previous token response' })
  @IsString()
  refreshToken: string;
}
