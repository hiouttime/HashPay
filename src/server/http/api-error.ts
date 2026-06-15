export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export function errorBody(error: unknown) {
  if (error instanceof AppError) {
    return {
      body: { error: { code: error.code, message: error.message } },
      status: error.status,
    };
  }
  if (error instanceof Error) {
    return {
      body: { error: { code: "internal_error", message: error.message } },
      status: 500,
    };
  }
  return {
    body: { error: { code: "internal_error", message: "Internal error" } },
    status: 500,
  };
}
