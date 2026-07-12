import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthenticatedUser, CurrentUser, Role, Roles } from '@clevscaffold/common';
import { UsersService } from './users.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { ListUsersDto } from './dto/list-users.dto';

@ApiTags('users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get('me')
  @ApiOperation({ summary: 'Get current user profile' })
  async me(@CurrentUser() current: AuthenticatedUser) {
    const user = await this.users.getByIdOrFail(current.sub);
    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      role: user.role,
      createdAt: user.createdAt,
      lastLoginAt: user.lastLoginAt,
    };
  }

  @Patch('me')
  @ApiOperation({ summary: 'Update profile fields' })
  async updateProfile(@CurrentUser() current: AuthenticatedUser, @Body() dto: UpdateProfileDto) {
    const user = await this.users.updateProfile(current.sub, dto);
    return { id: user.id, email: user.email, displayName: user.displayName };
  }

  @Get('me/export')
  @ApiOperation({ summary: 'Export all personal data (GDPR)' })
  exportData(@CurrentUser() current: AuthenticatedUser) {
    return this.users.exportUserData(current.sub);
  }

  @Delete('me')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete account (soft-delete)' })
  async deleteAccount(@CurrentUser() current: AuthenticatedUser) {
    await this.users.softDeleteAccount(current.sub);
  }

  /** Role-gated example: only ADMIN (or SUPER_ADMIN implicitly) can list users. */
  @Get()
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'List users (admin only, paginated)' })
  list(@Query() query: ListUsersDto) {
    return this.users.findAllPaginated(query);
  }
}
