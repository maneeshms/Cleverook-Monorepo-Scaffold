import { Body, Controller, Delete, Get, HttpCode, Param, Put } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthenticatedUser, CurrentUser, Role, Roles } from '@clevscaffold/common';
import { FeatureFlagsService } from './feature-flags.service';
import { FlagKeyParam, UpsertFlagDto } from './dto/upsert-flag.dto';

@ApiTags('feature-flags')
@Controller('feature-flags')
export class FeatureFlagsController {
  constructor(private readonly flags: FeatureFlagsService) {}

  @Get(':key/evaluate')
  @ApiOperation({ summary: 'Evaluate a boolean flag for the current user' })
  async evaluate(@Param() { key }: FlagKeyParam, @CurrentUser() user: AuthenticatedUser) {
    // targetingKey lets a provider do per-user rollouts / targeting.
    const enabled = await this.flags.isEnabled(key, false, {
      targetingKey: user.sub,
      role: user.role,
    });
    return { key, enabled };
  }

  @Get()
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'List database feature flags (admin)' })
  list() {
    return this.flags.listFlags();
  }

  @Put(':key')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Create or update a database feature flag (admin)' })
  upsert(@Param() { key }: FlagKeyParam, @Body() dto: UpsertFlagDto) {
    return this.flags.upsertFlag({ key, ...dto });
  }

  @Delete(':key')
  @Roles(Role.ADMIN)
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete a database feature flag (admin)' })
  async remove(@Param() { key }: FlagKeyParam) {
    await this.flags.deleteFlag(key);
  }
}
