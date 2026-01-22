import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Job } from './entities/job.entity';
import { JobAttempt } from './entities/job-attempt.entity';
import { JobLog } from './entities/job-log.entity';
import { User } from './entities/user.entity';
import { Tenant } from './entities/tenant.entity';
import { Worker } from './entities/worker.entity';


@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: process.env.DB_HOST,
      port: parseInt(process.env.DB_PORT || '5432', 10),
      username: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASS || 'postgres',
      database: process.env.DB_NAME || 'job_que',
      entities: [Job, JobAttempt, JobLog, User, Tenant, Worker],
      synchronize: true,
      logging: true,
    }),
    TypeOrmModule.forFeature([Job, JobAttempt, JobLog, User, Tenant, Worker]),
  ],
  exports: [TypeOrmModule],
})
export class DatabaseModule {}
