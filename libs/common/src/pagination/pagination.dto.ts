import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

/**
 * Standard pagination query. Extend it for per-resource filters:
 *   class ListTasksDto extends PaginationQueryDto { @IsOptional() @IsEnum(...) status?: TaskStatus }
 * The limit is hard-capped at 100 to keep list endpoints DoS-resistant.
 */
export class PaginationQueryDto {
  @ApiPropertyOptional({ minimum: 1, default: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  page = 1;

  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 20 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  limit = 20;

  get skip(): number {
    return (this.page - 1) * this.limit;
  }
}
