import { Module, OnApplicationBootstrap, Inject } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { JobsModule, DatabaseModule } from '@jobque/shared';
import { WorkerModule } from '@jobque/workers';
// import { MediaWorker } from '@jobque/workers/media-worker/worker';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { join } from 'path';
import { DataSource } from 'typeorm';

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
      // logging: true // this gives all the logging of database in console
      logging: ['error', 'warn'],
    }),
    DatabaseModule,
    JobsModule,
    WorkerModule,
  ],
  providers: [AppService],
  controllers: [AppController],
})
// export class AppModule {}
export class AppModule implements OnApplicationBootstrap {
  constructor(
    @Inject(AppService) private readonly appService: AppService,
    private readonly dataSource: DataSource,
  ) {}
  onApplicationBootstrap() {
    if (this.appService) {
      console.log('✅ AppService exists in AppModule:', this.appService);
    } else {
      console.error('❌ AppService is undefined in AppModule!');
    }
  }
  // constructor(private readonly mediaWorker: MediaWorker) {}
  // onApplicationBootstrap() {
  //   // Workers will start automatically on module init
  //   console.log('🔥 All workers are initialized');
  // }
}
