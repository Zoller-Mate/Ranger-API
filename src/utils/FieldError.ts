import AppError from './appError';

class FieldError extends AppError {
  public errorFields: { field: string; message: string }[];

  constructor(
    message: string,
    statusCode: number,
    errorFields: { field: string; message: string }[],
  ) {
    super(message, statusCode);
    this.errorFields = errorFields;
  }
}

export default FieldError;
