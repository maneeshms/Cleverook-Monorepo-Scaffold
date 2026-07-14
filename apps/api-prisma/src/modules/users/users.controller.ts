import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { AuthenticatedUser, CurrentUser } from '@clevrook/common';
import { toProfile, UsersService } from './users.service';

export class UpdateProfileDto {
  @ApiProperty({ required: false, example: 'Alex Builder' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  displayName?: string;
}

@ApiTags('users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get('me')
  @ApiOperation({ summary: 'Get current user profile' })
  async me(@CurrentUser() current: AuthenticatedUser) {
    return toProfile(await this.users.getByIdOrFail(current.sub));
  }

  @Patch('me')
  @ApiOperation({ summary: 'Update profile fields' })
  async updateProfile(@CurrentUser() current: AuthenticatedUser, @Body() dto: UpdateProfileDto) {
    return toProfile(await this.users.updateProfile(current.sub, dto));
  }

  @Delete('me')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete account (soft-delete)' })
  async deleteAccount(@CurrentUser() current: AuthenticatedUser) {
    await this.users.softDeleteAccount(current.sub);
  }
}
