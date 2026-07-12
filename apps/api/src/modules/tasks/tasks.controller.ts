import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthenticatedUser, CurrentUser } from '@clevscaffold/common';
import { TasksService } from './tasks.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { ListTasksDto } from './dto/list-tasks.dto';

@ApiTags('tasks')
@ApiBearerAuth()
@Controller('tasks')
export class TasksController {
  constructor(private readonly tasks: TasksService) {}

  @Post()
  @ApiOperation({ summary: 'Create a task (assigning notifies the assignee)' })
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateTaskDto) {
    return this.tasks.create(user.sub, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List my tasks (owned or assigned; paginated, filterable)' })
  list(@CurrentUser() user: AuthenticatedUser, @Query() query: ListTasksDto) {
    return this.tasks.findAllForUser(user.sub, query);
  }

  @Get('stats')
  @ApiOperation({ summary: 'My task counts by status (Redis cache-aside example)' })
  stats(@CurrentUser() user: AuthenticatedUser) {
    return this.tasks.getStats(user.sub);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one task (owner or assignee only)' })
  findOne(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.tasks.findOneForUser(id, user.sub);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a task (owner; assignees may update status)' })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTaskDto,
  ) {
    return this.tasks.update(id, user.sub, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a task (owner only, soft delete)' })
  async remove(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    await this.tasks.remove(id, user.sub);
  }
}
