import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class UnregisterDeviceDto {
  @ApiProperty({ description: 'The FCM registration token to remove', maxLength: 512 })
  @IsString()
  @MinLength(10)
  @MaxLength(512)
  token: string;
}
