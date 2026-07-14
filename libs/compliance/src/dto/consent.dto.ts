import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateConsentDto {
  @ApiProperty({ example: 'marketing_email', description: 'Processing purpose' })
  @IsString()
  @MaxLength(100)
  purpose: string;

  @ApiProperty({ example: true, description: 'true = grant, false = withdraw' })
  @IsBoolean()
  granted: boolean;

  @ApiProperty({ required: false, example: '2026-01-01' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  policyVersion?: string;
}
