import { HttpError } from '../utils/httpError.js';

/**
 * Validates req.params / req.query / req.body with zod and stores the parsed
 * (typed + sanitized) values on req.valid. Controllers only read req.valid,
 * so raw input such as { "$gt": "" } can never reach a Mongo query.
 */
export const validate = (schemas) => (req, _res, next) => {
  req.valid = req.valid || {};
  for (const key of ['params', 'query', 'body']) {
    if (!schemas[key]) continue;
    const result = schemas[key].safeParse(req[key] ?? {});
    if (!result.success) throw new HttpError(400, 'Validation failed', result.error.flatten());
    req.valid[key] = result.data;
  }
  next();
};
