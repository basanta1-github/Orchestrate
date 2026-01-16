import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DatabaseModule } from './database/database.module';
import { JobsModule } from './jobs/jobs.module';

@Module({
  imports: [
  DatabaseModule,
  JobsModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
