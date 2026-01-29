import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { JobsModule, DatabaseModule, QueueService } from '@jobque/shared';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { join } from 'path';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true, // 👈 critical
      envFilePath: join(process.cwd(), '../.env'),
    }),
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: process.env.DB_HOST,
      port: parseInt(process.env.DB_PORT || '5432', 10),
      username: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASS || 'postgres',
      database: process.env.DB_NAME || 'job_que',
      autoLoadEntities: true,
      synchronize: true,
      logging: true,
    }),
    DatabaseModule,
    JobsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
  // exports: [TypeOrmModule],
})
export class AppModule {}
