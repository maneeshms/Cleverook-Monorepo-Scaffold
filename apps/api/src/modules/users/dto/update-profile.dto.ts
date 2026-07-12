import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateProfileDto {
  @ApiProperty({ required: false, example: 'Alex Builder' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  displayName?: string;
}
