import { createParamDecorator, ExecutionContext } from "@nestjs/common";

export const AuthUser = createParamDecorator(
  (data: keyof any, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user; // attached by jwtauthguard

    if (!user) return null;

    //map jwt payload to legacy "id" field
    // const mappedUser = { ...user, id: user.userId };
    // return data ? mappedUser[data] : mappedUser;

    return data ? user[data] : user;
  },
);
