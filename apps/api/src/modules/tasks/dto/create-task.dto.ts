import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class CreateTaskDto {
  @ApiProperty({ example: 'Ship the release' })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title: string;

  @ApiProperty({ required: false, example: 'Cut the tag, run the checklist, deploy.' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiProperty({ required: false, description: 'Assign to another user (sends them a notification)' })
  @IsOptional()
  @IsUUID()
  assigneeId?: string;

  @ApiProperty({ required: false, example: '2026-08-01T12:00:00Z' })
  @IsOptional()
  @IsDateString()
  dueDate?: string;
}
