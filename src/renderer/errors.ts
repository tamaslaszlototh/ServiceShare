import { AppError } from '@shared/types';

export function errorLabel(error: AppError): string {
  return error.message.startsWith(error.code) ? error.message : `${error.code}: ${error.message}`;
}
