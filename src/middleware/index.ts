import { Application } from "express";
import { setupSecurity } from "./security";
import { setupLogging } from "./logging";
import { setupBodyParsing } from "./bodyParsing";

export const setupMiddleware = (app: Application): void => {
  setupSecurity(app);

  setupBodyParsing(app);

  setupLogging(app);
};
