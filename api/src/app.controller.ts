import { Controller, Get, Inject, Redirect } from '@nestjs/common';
import { Public } from '@jobque/shared';
import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(@Inject(AppService) private readonly appService: AppService) {}

  @Public()
  @Get()
  @Redirect('/dashboard/', 302)
  rootRedirect() {
    return;
  }

  @Public()
  @Get('api-info')
  getHello(): string {
    return this.appService.getHello();
  }
}
