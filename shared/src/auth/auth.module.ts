import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { JwtService } from "@nestjs/jwt";
// import { PassportModule } from "@nestjs/passport";
import { JwtModule } from "@nestjs/jwt";
// import { JwtStrategy } from "./jwt.strategy";
// import { GoogleStrategy } from "./oauth.strategy";
import { jwtConstants } from "./jwt-constants";
import { JwtStrategy } from "./jwt.strategy";

@Module({
  imports: [
    DatabaseModule,
    // PassportModule,
    JwtModule.register({
      secret: jwtConstants.secret,
      signOptions: { expiresIn: "1h" },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy],
  //   exports: [JwtModule, JwtStrategy, GoogleStrategy],
  //   providers: [JwtStrategy, GoogleStrategy],
  //   exports: [JwtModule, JwtStrategy, GoogleStrategy],
})
export class AuthModule {}
