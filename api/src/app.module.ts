import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DatabaseModule } from '@jobque/shared';
// import { DatabaseModule } from './database/database.module';
// import { JobsModule } from './jobs/jobs.module';
import { JobsModule } from '@jobque/shared';

@Module({
  imports: [DatabaseModule, JobsModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
