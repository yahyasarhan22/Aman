import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EstablishmentsModule } from './establishments/establishments.module';
import { AuthModule } from './auth/auth.module';
import { InspectorModule } from './inspector/inspector.module';
import { RiskModule } from './risk/risk.module';
import { UploadsModule } from './uploads/uploads.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'mysql',
        host: config.get('DB_HOST', 'localhost'),
        port: parseInt(config.get('DB_PORT', '3306'), 10),
        username: config.get('DB_USER', 'root'),
        password: config.get('DB_PASSWORD', ''),
        database: config.get('DB_NAME', 'aman'),
        autoLoadEntities: true,
        synchronize: true, // MVP only — replace with migrations before any real pilot
      }),
    }),
    AuthModule,
    RiskModule,
    EstablishmentsModule,
    InspectorModule,
    UploadsModule,
  ],
})
export class AppModule {}
