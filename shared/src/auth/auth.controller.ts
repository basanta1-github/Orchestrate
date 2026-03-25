import {
  Controller,
  Post,
  Body,
  Get,
  UseGuards,
  Req,
  Res,
} from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { AuthService } from "./auth.service";
import { Public } from "./public.decorator";

@Controller("auth")
export class AuthController {
  constructor(private authService: AuthService) {}

  @Public()
  @Post("register")
  register(
    @Body()
    dto: {
      name: string;
      email: string;
      password: string;
      tenantName: string;
    },
  ) {
    return this.authService.register(dto);
  }
  @Public()
  @Post("login")
  login(@Body() dto: { email: string; password: string; tenantName?: string }) {
    return this.authService.login(dto);
  }
}
