# NestJS Playbook — how backend code is written here

The elaborated NestJS ruleset. `docs/agents/conventions.md` gives the one-liners;
this file shows the **exact shapes** with real code from this repo. Every example
below is distilled from `apps/api/src/modules/tasks` — the canonical module. When
in doubt, open that module and mirror it. **Don't invent new patterns when an
existing one fits; if none fits, say so in the PR rather than improvising silently.**

Stack facts (keep current): NestJS 11 · Express 5 · TypeORM 1.x (`apps/api`) ·
Prisma 7 with the `@prisma/adapter-pg` driver adapter (`apps/api-prisma`) · Jest 30.

---

## 1. Module anatomy

Every feature is a self-contained directory under `apps/<app>/src/modules/`:

```
modules/tasks/
  dto/
    create-task.dto.ts      # request DTOs — one per action
    update-task.dto.ts
    list-tasks.dto.ts       # query DTO (extends PaginationQueryDto)
  entities/
    task.entity.ts          # TypeORM entity (extends BaseEntity)
  tasks.controller.ts       # thin HTTP layer
  tasks.controller.spec.ts  # co-located unit tests
  tasks.service.ts          # ALL business logic + authorization
  tasks.service.spec.ts
  tasks.module.ts           # wiring only (excluded from coverage)
```

The module class only wires; it never contains logic:

```ts
@Module({
  imports: [TypeOrmModule.forFeature([Task]), UsersModule],
  controllers: [TasksController],
  providers: [TasksService],
  exports: [TasksService], // export ONLY if another module genuinely consumes it
})
export class TasksModule {}
```

Register it in `app.module.ts`. Note: `app.module.ts` carries
`clevscaffold:*:start/end` sentinel comments — add your import on its own line
and **never** inside someone else's sentinel block.

## 2. Controllers — thin, decorated, identity-from-JWT

A controller method does exactly three things: bind validated input, delegate to
the service, return the service's result. Nothing else.

```ts
@ApiTags('tasks')
@ApiBearerAuth()
@Controller('tasks') // global prefix makes this /api/v1/tasks
export class TasksController {
  constructor(private readonly tasks: TasksService) {}

  @Post()
  @ApiOperation({ summary: 'Create a task (assigning notifies the assignee)' })
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateTaskDto) {
    return this.tasks.create(user.sub, dto); // identity ALWAYS from the JWT
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one task (owner or assignee only)' })
  findOne(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.tasks.findOneForUser(id, user.sub);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a task (owner only)' })
  remove(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.tasks.remove(id, user.sub);
  }
}
```

**Controller rules (each has a reason):**

- **Never inject a repository / `PrismaService` into a controller** — data access
  belongs behind a service so authorization can't be bypassed by a new endpoint.
- **Identity comes from `@CurrentUser()`** (the verified JWT), never from the
  body/query. Accepting `userId` from the client is the classic BOLA hole.
- **UUID params go through `ParseUUIDPipe`** — garbage/traversal input dies with
  a 400 before touching your code.
- **Swagger on every endpoint:** `@ApiTags` (class) + `@ApiOperation` (method);
  add `@ApiResponse` where the shape isn't obvious. Docs are part of the API.
- Auth is **on by default** (global `JwtAuthGuard`). `@Public()` only for genuinely
  public routes; `@Roles(Role.ADMIN)` + nothing else for admin routes. Guard order
  is Throttle → JwtAuth → Roles and is already wired globally — don't re-add guards
  per-controller.
- No `try/catch` that swallows errors into 200s — let exceptions propagate to the
  global filter, which normalizes the shape and strips internals.

## 3. Services — logic, authorization, and the BOLA-safe 404

All business rules and **all** authorization live in services. The load-bearing
pattern — copy it exactly:

```ts
async findOneForUser(id: string, userId: string): Promise<Task> {
  const task = await this.tasks.findOne({ where: { id } });
  // 404 for both "missing" and "not yours": don't leak which ids exist (BOLA guard).
  if (!task || (task.ownerId !== userId && task.assigneeId !== userId)) {
    throw new NotFoundException('Task not found');
  }
  return task;
}
```

- **Every read/write of a user-owned resource re-checks ownership** — even when
  "the controller already filtered". Services are also called by other services.
- Use `NotFoundException` for missing-or-not-yours (existence hiding);
  `ForbiddenException` only where the resource's existence is already known to the
  caller (e.g. an assignee trying an owner-only field).
- Cross-entity references are validated (`await this.users.getByIdOrFail(dto.assigneeId)`)
  — never trust a foreign id from a DTO to exist.
- Throw NestJS `HttpException` subclasses on HTTP paths — a bare `Error` becomes an
  opaque 500 and loses the normalized error shape.
- Side effects that can tolerate latency (email, notifications) go through
  `MessagingService` — never block the response on third-party calls when the
  queue path exists.

## 4. DTOs — validation is the contract

Every request body and query string is a class with `class-validator` decorators
and Swagger metadata. The global `ValidationPipe` runs with `whitelist +
forbidNonWhitelisted + transform` — unknown fields are rejected, so **the DTO is
the complete list of what a client may send**.

```ts
export class CreateTaskDto {
  @ApiProperty({ example: 'Ship the release' })
  @IsString()
  @MinLength(1)
  @MaxLength(200) // ALWAYS bound string lengths — unbounded input is a DoS vector
  title: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsUUID()
  assigneeId?: string;
}
```

- **Never add privileged fields** (`role`, `ownerId`, `isAdmin`, tenant ids) to a
  client-writable DTO — that's mass assignment. The server derives them.
- Update DTOs are explicit (`UpdateTaskDto` with all-optional validated fields) —
  don't `PartialType` a create DTO that contains creation-only fields.
- Query DTOs for lists extend the shared `PaginationQueryDto` (caps `limit` ≤ 100)
  and return the `paginate()` envelope: `{ data, meta: { total, page, limit, totalPages } }`.
- **Responses never expose entities** with sensitive columns. If the entity holds
  `passwordHash`-class data, map to a response DTO. Enforce by shape, not by hope.
- Dates cross the wire as ISO strings (`@IsDateString()`), converted at the service
  boundary.

## 5. Data access

### TypeORM (`apps/api`)

- Entities extend `BaseEntity` (uuid PK, `createdAt/updatedAt/deletedAt`) and live
  in the module's `entities/`. Columns are snake_case via naming strategy.
- Inject with `@InjectRepository(Task)`; register via
  `TypeOrmModule.forFeature([Task])` in the module.
- Filters/search use the query builder **with bound parameters** — never string
  interpolation:

```ts
qb.andWhere('task.title ILIKE :search', { search: `%${query.search}%` }); // ✅
qb.andWhere(`task.title ILIKE '%${query.search}%'`); // ❌ injection
```

- Multi-write invariants use a transaction (`dataSource.transaction(...)`); don't
  hand-roll compensation logic.
- **Schema changes are migrations only** — hand-written under
  `libs/database/src/migrations/` (timestamp prefix). `synchronize` is never
  enabled, in any environment, including tests. Enums use the
  `DO $$ … EXCEPTION WHEN duplicate_object …` guard (no `CREATE TYPE IF NOT EXISTS`
  in Postgres). Add indexes for every column your new queries filter/join on.

### Prisma (`apps/api-prisma`)

- Prisma 7: the connection goes through the **pg driver adapter** in
  `PrismaService`; migration commands read `PRISMA_DATABASE_URL` via the root
  `prisma.config.ts`. There is no `url` in `schema.prisma` — don't re-add one.
- Schema edits → `npm run prisma:migrate` (dev) / `prisma:deploy` (CI/prod);
  models `PascalCase` with `@@map` to snake_case tables.
- Raw SQL only as tagged templates (`$queryRaw\`… ${param}\``) — never
  `$queryRawUnsafe` with user input.

## 6. Config, logging, and cross-cutting services

```ts
const ttl = this.config.get<string>('jwt.accessTtl'); // ✅ typed namespace
const ttl = process.env.JWT_ACCESS_TTL; // ❌ ESLint blocks this
```

- New config keys need all three: an entry in the app's `config/*.json`
  (non-secret) **or** `.env.example` (secret), a `class-validator` rule in
  `libs/config`, and a typed namespace read. See `recipes.md` for the steps.
- Log through `LoggerService`. Privileged/auth actions call `logger.audit()`;
  security-critical events call `logger.alert()`/`alertSecurity()`. Never log
  tokens, hashes, passwords, or connection strings — not even at `debug`.
- Redis is optional by design: `RedisService` is null-safe. Cache-aside reads
  (see `TasksService.getStats`) must behave correctly when Redis is absent —
  guard with the service's null checks, never assume a connection.
- External calls follow the **no-mock rule**: real provider, configurable, and an
  explicit fallback or `503` when unconfigured. Fabricated success values are
  never acceptable — they hide misconfiguration until production.
- Cross-cutting needs are **always served by the shipped libs** (capability map
  in AGENTS.md) — messaging for outbound messages, feature-flags for gating,
  compliance for audit/GDPR. Two compliance hooks apply to feature work:
  a module storing personal data registers a `PersonalDataContributor`
  (recipe: "Register a module's personal data"), and sensitive mutations call
  `auditService.record(...)` with ids/field names only — never PII values.

## 7. Unit testing NestJS (the shapes that reach 90%)

Use `Test.createTestingModule` with **mocked providers** — no DB, no network:

```ts
const repo = { findOne: jest.fn(), save: jest.fn(), create: jest.fn((x) => x) };

const module = await Test.createTestingModule({
  providers: [
    TasksService,
    { provide: getRepositoryToken(Task), useValue: repo },
    { provide: UsersService, useValue: { getByIdOrFail: jest.fn() } },
    { provide: MessagingService, useValue: { dispatch: jest.fn() } },
    { provide: RedisService, useValue: { get: jest.fn(), set: jest.fn(), del: jest.fn() } },
    { provide: LoggerService, useValue: { log: jest.fn(), audit: jest.fn() } },
  ],
}).compile();
```

What to cover (this is how 90% happens naturally, not by padding):

- the happy path **and** every thrown branch (`NotFoundException` on missing AND
  on not-owned — two separate tests, they are different bugs);
- guard/fallback branches (Redis absent, optional fields omitted, provider
  unconfigured → explicit error);
- that privileged fields are rejected / ignored (mass-assignment regression);
- controller specs assert delegation: right service method, right args
  (`user.sub`, not anything from the body).

Descriptive names: `it('returns 404 when the task belongs to someone else')`,
never `it('works')`. e2e (real app + Postgres) covers wiring, guards-in-flight,
and the OWASP suite — extend `apps/api/test/security-owasp.e2e-spec.ts` whenever
you add a sensitive route. Details: `docs/agents/testing.md`.

## 8. Things that look fine but are bugs here

| Looks reasonable                                                             | Why it's wrong here                                                  | Do instead                                          |
| ---------------------------------------------------------------------------- | -------------------------------------------------------------------- | --------------------------------------------------- |
| `@UseGuards(JwtAuthGuard)` on a controller                                   | Guards are global; re-adding them hides which routes are `@Public()` | Nothing — it's already guarded                      |
| `findOne` then `if (task.ownerId !== userId) throw new ForbiddenException()` | 403 confirms the id exists → enumeration                             | BOLA-safe 404 (see §3)                              |
| `Partial<Entity>` as an update payload                                       | Bypasses validation whitelist → mass assignment                      | Explicit update DTO                                 |
| `JSON.stringify(user)` in a log line                                         | Entities carry hashes/flags                                          | Log ids + named fields                              |
| `synchronize: true` "just for tests"                                         | Schema drift, and e2e runs real migrations                           | `npm run e2e:setup` migrates                        |
| `process.env.X ?? 'default'` in a service                                    | Bypasses validation + layering                                       | Config namespace + JSON default                     |
| Returning the entity from register/login                                     | Leaks `passwordHash`                                                 | Response DTO / explicit field pick                  |
| `catch (e) { return null }`                                                  | Swallows real failures into fake success                             | Let it throw; filter normalizes                     |
| Free-form `@Query('page') page: number`                                      | No validation, no cap                                                | Query DTO extending `PaginationQueryDto`            |
| `npm install some-lib` at the root                                           | Root is tooling-only; dep belongs to the package that imports it     | Add to that package's `package.json`, exact-pinned  |
| A hand-rolled `*_history`/audit table for "who did what"                     | Mutable + un-chained — worthless as audit evidence                   | `AuditService.record(...)` (`@clevrook/compliance`) |
| `softDelete()` as the answer to a GDPR erasure request                       | PII survives — Art. 17 requires erasure/anonymisation                | Contributor `erase()` (see compliance recipe)       |
