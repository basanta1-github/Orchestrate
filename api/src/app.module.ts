import { Module, OnApplicationBootstrap, Inject } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { JobsModule, DatabaseModule } from '@jobque/shared';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { join } from 'path';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
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
  providers: [AppService],
  controllers: [AppController],
})
export class AppModule implements OnApplicationBootstrap {
  constructor(@Inject(AppService) private readonly appService: AppService) {}

  onApplicationBootstrap() {
    if (this.appService) {
      console.log('✅ AppService exists in AppModule:', this.appService);
    } else {
      console.error('❌ AppService is undefined in AppModule!');
    }
  }
}
