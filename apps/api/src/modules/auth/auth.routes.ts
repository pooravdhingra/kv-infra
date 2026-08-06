import {
  Router,
  type NextFunction,
  type Request,
  type Response,
} from "express";

import type { AuthService } from "./auth.service.js";

const asyncRoute =
  (handler: (request: Request, response: Response) => Promise<void> | void) =>
  (request: Request, response: Response, next: NextFunction) => {
    Promise.resolve(handler(request, response)).catch(next);
  };

export const createAuthRouter = (service: AuthService) => {
  const router = Router();

  router.get("/session", (request, response) => {
    response.json({ data: service.session(request.headers.cookie) });
  });

  router.post(
    "/login",
    asyncRoute((request, response) => {
      const result = service.login(request.body, request.ip ?? "unknown");
      response.setHeader("set-cookie", result.cookie);
      response.json({ data: result.session });
    }),
  );

  router.post("/logout", (_request, response) => {
    response.setHeader("set-cookie", service.clearCookie());
    response.json({ data: { authenticated: false, role: null } });
  });

  return router;
};

export const requireAuthentication =
  (service: AuthService) =>
  (request: Request, response: Response, next: NextFunction) => {
    try {
      response.locals.auth = service.requireSession(request.headers.cookie);
      next();
    } catch (error) {
      next(error);
    }
  };
