import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '@clevscaffold/common';
import { TaskStatus } from '../entities/task.entity';

export class ListTasksDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: TaskStatus })
  @IsOptional()
  @IsEnum(TaskStatus)
  status?: TaskStatus;

  @ApiPropertyOptional({ description: 'Match against the task title' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;
}
