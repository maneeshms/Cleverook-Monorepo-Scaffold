// Module + registration
export * from './auth.module';
export * from './auth.options';

// Extension surface — subclass these
export * from './services/auth.service';
export * from './services/token.service';
export * from './services/session-cleanup.service';
export * from './controllers/auth.controller';
export * from './strategies/jwt.strategy';

// The host-implemented user store port
export * from './interfaces/auth-user-store.interface';

// DTOs (extend for extra registration fields, keep validation)
export * from './dto/register.dto';
export * from './dto/login.dto';
export * from './dto/refresh.dto';

// Entity — exported so hosts can query sessions (GDPR export, device views)
export * from './entities/user-session.entity';
