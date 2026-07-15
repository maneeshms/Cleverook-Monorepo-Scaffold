import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsString, MaxLength, MinLength } from 'class-validator';
import { DevicePlatform } from '@clevrook/messaging';

export class RegisterDeviceDto {
  @ApiProperty({
    description: 'FCM registration token obtained on the device (Android/iOS/Web)',
    example: 'dGVzdC1mY20tcmVnaXN0cmF0aW9uLXRva2Vu…',
    maxLength: 512,
  })
  @IsString()
  @MinLength(10)
  @MaxLength(512)
  token: string;

  @ApiProperty({ enum: DevicePlatform, example: DevicePlatform.ANDROID })
  @IsEnum(DevicePlatform)
  platform: DevicePlatform;
}
