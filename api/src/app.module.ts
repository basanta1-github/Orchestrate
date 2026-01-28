import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
// import { DatabaseModule, JobsModule } from '@jobque/shared';
import { JobsModule, JobRepository } from '@jobque/shared';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Job, JobAttempt, JobLog, User, Tenant, Worker } from '@jobque/shared';
import { DataSource } from 'typeorm';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: process.env.DB_HOST,
      port: parseInt(process.env.DB_PORT || '5432', 10),
      username: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASS || 'postgres',
      database: process.env.DB_NAME || 'job_que',
      // entities: [Job, JobAttempt, JobLog, User, Tenant, Worker],
      autoLoadEntities: true,
      synchronize: true,
      logging: true,
    }),
    // DatabaseModule,
    JobsModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    // {
    //   provide: 'JobRepositoryInitializer',
    //   useFactory: (dataSource: DataSource, jobRepo: JobRepository) => {
    //     jobRepo.setDataSource(dataSource);
    //     return jobRepo;
    //   },
    //   inject: [DataSource, JobRepository],
    // },
  ],
  exports: [TypeOrmModule],
})
export class AppModule {}
