import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { AllExceptionsFilter } from './errordebugger';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import 'reflect-metadata';
import { JwtAuthGuard, RoleGuard } from '@jobque/shared';

async function bootstrap() {
  try {
    const app = await NestFactory.create<NestExpressApplication>(AppModule, {
      logger: ['error', 'warn', 'log', 'debug', 'verbose'],
    });

    app.enableCors({
      origin: process.env.CORS_ORIGIN?.split(',') ?? true,
      credentials: true,
    });

    app.useGlobalGuards(app.get(JwtAuthGuard), app.get(RoleGuard));

    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        enableDebugMessages: true,
      }),
    );
    app.useGlobalFilters(new AllExceptionsFilter());

    // Serve dashboard at /dashboard/
    // Local dev:  <repo>/dashboard  (cwd = api/)
    // Docker:     /app/dashboard    (cwd = /app/api/)
    const dashboardPath = join(process.cwd(), '..', 'dashboard');
    app.useStaticAssets(dashboardPath, {
      prefix: '/dashboard/',
      index: ['index.html'],
    });

    const port = process.env.API_PORT || 3001;
    await app.listen(port);
    console.log(`🚀 API running on http://localhost:${port}`);
    console.log(`📊 Dashboard at http://localhost:${port}/dashboard/`);
  } catch (err) {
    console.error('🔥 BOOTSTRAP ERROR:', err);
    if (err instanceof Error && err.stack) {
      console.error(err.stack);
    }
    process.exit(1);
  }
}

void bootstrap();
