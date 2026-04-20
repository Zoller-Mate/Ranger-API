import AppError from './appError';

class PatchError extends AppError {
  public errorFields: string[];

  constructor(message: string, statusCode: number, errorFields: string[]) {
    super(message, statusCode);
    this.errorFields = errorFields;
  }
}

export default PatchError;