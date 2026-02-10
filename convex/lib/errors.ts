// Error codes for the CRM system
export const ErrorCodes = {
  // Authentication errors
  UNAUTHORIZED: "UNAUTHORIZED",
  FORBIDDEN: "FORBIDDEN",

  // Resource errors
  NOT_FOUND: "NOT_FOUND",
  ALREADY_EXISTS: "ALREADY_EXISTS",

  // Validation errors
  VALIDATION_ERROR: "VALIDATION_ERROR",
  INVALID_STAGE: "INVALID_STAGE",

  // Business logic errors
  DELETION_HAS_DEPENDENCIES: "DELETION_HAS_DEPENDENCIES",
  DUPLICATE_INVITE: "DUPLICATE_INVITE",
  USER_INACTIVE: "USER_INACTIVE",
  CANNOT_DEACTIVATE_SELF: "CANNOT_DEACTIVATE_SELF",
  CANNOT_DEACTIVATE_LAST_ADMIN: "CANNOT_DEACTIVATE_LAST_ADMIN",

  // System errors
  INTERNAL_ERROR: "INTERNAL_ERROR",
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];

export class CRMError extends Error {
  constructor(
    public code: ErrorCode,
    message: string,
    public details?: unknown
  ) {
    super(message);
    this.name = "CRMError";
  }
}

export function unauthorized(message = "Authentication required"): never {
  throw new CRMError(ErrorCodes.UNAUTHORIZED, message);
}

export function forbidden(message = "Permission denied"): never {
  throw new CRMError(ErrorCodes.FORBIDDEN, message);
}

export function notFound(entity: string, id?: string): never {
  const message = id ? `${entity} with id '${id}' not found` : `${entity} not found`;
  throw new CRMError(ErrorCodes.NOT_FOUND, message);
}

export function validationError(message: string, details?: unknown): never {
  throw new CRMError(ErrorCodes.VALIDATION_ERROR, message, details);
}

export function invalidStage(stage: string, validStages: string[]): never {
  throw new CRMError(
    ErrorCodes.INVALID_STAGE,
    `Invalid stage '${stage}'. Valid stages: ${validStages.join(", ")}`,
    { stage, validStages }
  );
}

export function hasDependencies(
  entity: string,
  dependencyType: string,
  count: number
): never {
  throw new CRMError(
    ErrorCodes.DELETION_HAS_DEPENDENCIES,
    `Cannot delete ${entity}: has ${count} ${dependencyType}`,
    { dependencyType, count }
  );
}

export function duplicateInvite(email: string): never {
  throw new CRMError(
    ErrorCodes.DUPLICATE_INVITE,
    `User with email '${email}' already exists in this tenant`
  );
}

// Format error for MCP response
export function formatError(error: unknown): {
  code: string;
  message: string;
  details?: unknown;
} {
  if (error instanceof CRMError) {
    return {
      code: error.code,
      message: error.message,
      details: error.details,
    };
  }

  if (error instanceof Error) {
    return {
      code: ErrorCodes.INTERNAL_ERROR,
      message: error.message,
    };
  }

  return {
    code: ErrorCodes.INTERNAL_ERROR,
    message: "An unexpected error occurred",
  };
}
