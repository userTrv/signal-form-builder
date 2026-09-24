/**
 * Public surface of the engine: schema format, validation, expression language, rule
 * builder and type generation. Nothing here renders UI.
 */
export * from './expr';
export * from './schema/types';
export * from './schema/field-kinds';
export * from './schema/walk';
export * from './schema/validate-schema';
export * from './model/computed';
export * from './model/validators';
export * from './model/mock-backend';
export * from './model/build-rules';
export * from './typegen/generate-ts';
export * from './typegen/infer';
export * from './expr/check';
