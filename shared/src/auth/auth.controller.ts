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

import { UserRole } from "../database";
import { AuthUser } from "./auth.user.decorator";
import { Roles } from "../rbac/roles.decorer";
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
  // Admin creates normal users
  @Post("create-users")
  @Roles("admin")
  async createUser(
    @Body()
    dto: { name: string; email: string; password: string; role: UserRole },
    @AuthUser() admin: any,
  ) {
    return this.authService.createUserByAdmin(dto, admin);
  }
  @Public()
  @Post("login")
  login(@Body() dto: { email: string; password: string; tenantName?: string }) {
    return this.authService.login(dto);
  }
}
