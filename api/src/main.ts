import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import {ValidationPipe} from '@nestjs/common'
async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // global validation
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // remove unknown fields
      forbidNonWhitelisted: true, // throw error on unknown fields
      transform: true // convert payload into DTO class
    })
  )
  const port = process.env.API_PORT || 3001;
  await app.listen(port);
   console.log(`🚀 API running on http://localhost:${port}`);
}
bootstrap();
