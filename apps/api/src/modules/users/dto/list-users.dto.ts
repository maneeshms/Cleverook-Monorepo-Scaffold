import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '@clevscaffold/common';

export class ListUsersDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Match against email or display name' })
  @IsOptional()
  @IsString()
  @MaxLength(320)
  search?: string;
}
