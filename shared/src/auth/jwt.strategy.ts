import { Injectable, UnauthorizedException } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
import { jwtConstants } from "./jwt-constants";
import { User } from "../database";
import { Repository } from "typeorm";
import { InjectRepository } from "@nestjs/typeorm";

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: jwtConstants.secret,
    });
  }

  async validate(payload: any) {
    const user = await this.userRepo.findOne({
      where: { id: payload.sub },
      relations: ["tenant"],
    });
    if (!user) throw new UnauthorizedException("User not found");
    return user; // attaches full User entity to req.user
    // payload contains what you put in JWT
    // attach to req.user automatically
    // return {
    //   userId: payload.sub,
    //   tenantId: payload.tenantId,
    //   email: payload.email,
    //   role: payload.role,
    // };
  }
}
