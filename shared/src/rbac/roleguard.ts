import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";

@Injectable()
export class RoleGuard implements CanActivate {
  constructor(private reflector: Reflector) {}
  canActivate(context: ExecutionContext): boolean {
    const requiredRoles: string[] =
      this.reflector.get<string[]>("roles", context.getHandler()) || [];

    const request = context.switchToHttp().getRequest();
    const user = request.user;
    if (!requiredRoles || requiredRoles.length === 0) {
      return true; // no role restriction, allow access
    }

    if (!user) throw new ForbiddenException("user not authenticated");

    if (!requiredRoles.includes(user.role)) {
      throw new ForbiddenException("Access Denied: insufficient role");
    }
    return true;
  }
}
