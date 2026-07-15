// Module + registration
export * from './messaging.module';
export * from './messaging.options';

// Public service surface
export * from './services/messaging.service';
export * from './services/messaging-config.service';
export * from './services/template.service';
export * from './services/delivery-queue.service';
export * from './services/device-token.service';

// Enums, interfaces, contracts
export * from './enums/channel.enum';
export * from './enums/message-category.enum';
export * from './enums/message-type';
export * from './enums/device-platform.enum';
export * from './interfaces/channel-provider.interface';
export * from './interfaces/in-app-sink.interface';

// Templates registry (host may inspect/extend)
export * from './templates/registry';

// Entities — exported so the host can reference them if needed (autoLoadEntities
// registers them via forFeature; migrations live in @clevrook/database for now).
export * from './entities/messaging-provider-config.entity';
export * from './entities/messaging-channel-route.entity';
export * from './entities/message-template.entity';
export * from './entities/message-delivery.entity';
export * from './entities/device-token.entity';
