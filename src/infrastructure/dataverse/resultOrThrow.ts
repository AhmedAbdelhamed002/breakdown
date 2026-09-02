import type { IOperationResult } from "@microsoft/power-apps/data";
import { AppError } from "../errors/AppError";
import { logger } from "../logging/logger";

/** Unwraps a generated service's IOperationResult, throwing AppError on failure. */
export function resultOrThrow<T>(result: IOperationResult<T>, context: string): T {
  if (!result.success) {
    logger.error(context, result.error);
    throw new AppError(`${context} failed`, result.error);
  }
  return result.data;
}
