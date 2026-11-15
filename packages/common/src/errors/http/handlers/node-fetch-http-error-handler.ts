import { RequestError } from "../request-error";
import type { AnyRequestError } from "../request-error";
import type { ResponseError } from "../response-error";
import { matchErrorCode } from "./fetch-http-error-handler";
import { HttpErrorHandler } from "./http-error-handler";

/**
 * Shape of the FetchError that node-fetch throws.
 * The node-fetch package is no longer a dependency of the workspace, so the error is detected by its name.
 */
interface NodeFetchError extends Error {
  name: "FetchError";
  code?: string;
}

const isNodeFetchError = (error: unknown): error is NodeFetchError => {
  return error instanceof Error && error.name === "FetchError";
};

/**
 * node-fetch was a defacto standard to use fetch in nodejs.
 */
export class NodeFetchHttpErrorHandler extends HttpErrorHandler {
  constructor(private type = "node-fetch") {
    super(type);
  }

  handleRequestError(error: unknown): AnyRequestError | undefined {
    if (!isNodeFetchError(error)) return undefined;
    if (error.code === undefined) return undefined;

    this.logRequestError({
      code: error.code,
      message: error.message,
    });

    const requestErrorInput = matchErrorCode(error.code);
    if (!requestErrorInput) return undefined;

    return new RequestError(requestErrorInput, {
      cause: error,
    }) as AnyRequestError;
  }

  /**
   * Response errors do not exist for fetch as it does not throw errors for non successful responses.
   */
  handleResponseError(_: unknown): ResponseError | undefined {
    return undefined;
  }
}
