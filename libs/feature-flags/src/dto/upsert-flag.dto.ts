import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class UpsertFlagDto {
  @ApiProperty({ example: true })
  @IsBoolean()
  enabled: boolean;

  @ApiPropertyOptional({
    description: 'Variant payload for non-boolean flags (string/number/object).',
    example: { rolloutPercent: 25 },
  })
  @IsOptional()
  value?: unknown;

  @ApiPropertyOptional({ example: 'Enables the redesigned checkout flow' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}

export class FlagKeyParam {
  @ApiProperty({ example: 'new-checkout' })
  @IsString()
  @MaxLength(120)
  @Matches(/^[a-z0-9][a-z0-9-_.]*$/i, {
    message: 'key must be alphanumeric with - _ . separators',
  })
  key: string;
}
