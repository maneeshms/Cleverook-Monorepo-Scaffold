import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersModule } from '../users/users.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { TokenService } from './services/token.service';
import { SessionCleanupService } from './services/session-cleanup.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { UserSession } from './entities/user-session.entity';

@Module({
  imports: [
    UsersModule,
    PassportModule,
    JwtModule.register({}),
    TypeOrmModule.forFeature([UserSession]),
  ],
  controllers: [AuthController],
  providers: [AuthService, TokenService, SessionCleanupService, JwtStrategy],
  exports: [AuthService, TokenService],
})
export class AuthModule {}
