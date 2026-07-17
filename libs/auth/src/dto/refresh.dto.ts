import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class RefreshDto {
  @ApiProperty({ description: 'Opaque refresh token from the previous token response' })
  @IsString()
  refreshToken: string;
}
