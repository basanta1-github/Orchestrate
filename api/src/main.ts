import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import 'reflect-metadata';
async function bootstrap() {
  try {
    const app = await NestFactory.create(AppModule, {
      logger: ['error', 'warn', 'log', 'debug', 'verbose'], // verbose logs
    });

    // global validation
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true, // remove unknown fields
        forbidNonWhitelisted: true, // throw error on unknown fields
        transform: true, // convert payload into DTO class
      }),
    );
    const port = process.env.API_PORT || 3001;
    await app.listen(port);
    console.log(`🚀 API running on http://localhost:${port}`);
  } catch (err) {
    console.error('🔥 BOOTSTRAP ERROR:', err);
    // If the error has a stack trace, print it
    if (err.stack) {
      console.error(err.stack);
    }
    process.exit(1); // stop the app
  }
}

bootstrap();
