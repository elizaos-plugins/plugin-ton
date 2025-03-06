// src/actions/transfer.ts
import {
  elizaLogger,
  composeContext,
  ModelClass,
  generateObject
} from "@elizaos/core";

// ../../node_modules/.pnpm/zod@3.24.1/node_modules/zod/lib/index.mjs
var util;
(function(util2) {
  util2.assertEqual = (val) => val;
  function assertIs(_arg) {
  }
  util2.assertIs = assertIs;
  function assertNever(_x) {
    throw new Error();
  }
  util2.assertNever = assertNever;
  util2.arrayToEnum = (items) => {
    const obj = {};
    for (const item of items) {
      obj[item] = item;
    }
    return obj;
  };
  util2.getValidEnumValues = (obj) => {
    const validKeys = util2.objectKeys(obj).filter((k) => typeof obj[obj[k]] !== "number");
    const filtered = {};
    for (const k of validKeys) {
      filtered[k] = obj[k];
    }
    return util2.objectValues(filtered);
  };
  util2.objectValues = (obj) => {
    return util2.objectKeys(obj).map(function(e) {
      return obj[e];
    });
  };
  util2.objectKeys = typeof Object.keys === "function" ? (obj) => Object.keys(obj) : (object) => {
    const keys = [];
    for (const key in object) {
      if (Object.prototype.hasOwnProperty.call(object, key)) {
        keys.push(key);
      }
    }
    return keys;
  };
  util2.find = (arr, checker) => {
    for (const item of arr) {
      if (checker(item))
        return item;
    }
    return void 0;
  };
  util2.isInteger = typeof Number.isInteger === "function" ? (val) => Number.isInteger(val) : (val) => typeof val === "number" && isFinite(val) && Math.floor(val) === val;
  function joinValues(array, separator = " | ") {
    return array.map((val) => typeof val === "string" ? `'${val}'` : val).join(separator);
  }
  util2.joinValues = joinValues;
  util2.jsonStringifyReplacer = (_, value) => {
    if (typeof value === "bigint") {
      return value.toString();
    }
    return value;
  };
})(util || (util = {}));
var objectUtil;
(function(objectUtil2) {
  objectUtil2.mergeShapes = (first, second) => {
    return {
      ...first,
      ...second
      // second overwrites first
    };
  };
})(objectUtil || (objectUtil = {}));
var ZodParsedType = util.arrayToEnum([
  "string",
  "nan",
  "number",
  "integer",
  "float",
  "boolean",
  "date",
  "bigint",
  "symbol",
  "function",
  "undefined",
  "null",
  "array",
  "object",
  "unknown",
  "promise",
  "void",
  "never",
  "map",
  "set"
]);
var getParsedType = (data) => {
  const t = typeof data;
  switch (t) {
    case "undefined":
      return ZodParsedType.undefined;
    case "string":
      return ZodParsedType.string;
    case "number":
      return isNaN(data) ? ZodParsedType.nan : ZodParsedType.number;
    case "boolean":
      return ZodParsedType.boolean;
    case "function":
      return ZodParsedType.function;
    case "bigint":
      return ZodParsedType.bigint;
    case "symbol":
      return ZodParsedType.symbol;
    case "object":
      if (Array.isArray(data)) {
        return ZodParsedType.array;
      }
      if (data === null) {
        return ZodParsedType.null;
      }
      if (data.then && typeof data.then === "function" && data.catch && typeof data.catch === "function") {
        return ZodParsedType.promise;
      }
      if (typeof Map !== "undefined" && data instanceof Map) {
        return ZodParsedType.map;
      }
      if (typeof Set !== "undefined" && data instanceof Set) {
        return ZodParsedType.set;
      }
      if (typeof Date !== "undefined" && data instanceof Date) {
        return ZodParsedType.date;
      }
      return ZodParsedType.object;
    default:
      return ZodParsedType.unknown;
  }
};
var ZodIssueCode = util.arrayToEnum([
  "invalid_type",
  "invalid_literal",
  "custom",
  "invalid_union",
  "invalid_union_discriminator",
  "invalid_enum_value",
  "unrecognized_keys",
  "invalid_arguments",
  "invalid_return_type",
  "invalid_date",
  "invalid_string",
  "too_small",
  "too_big",
  "invalid_intersection_types",
  "not_multiple_of",
  "not_finite"
]);
var quotelessJson = (obj) => {
  const json = JSON.stringify(obj, null, 2);
  return json.replace(/"([^"]+)":/g, "$1:");
};
var ZodError = class _ZodError extends Error {
  get errors() {
    return this.issues;
  }
  constructor(issues) {
    super();
    this.issues = [];
    this.addIssue = (sub) => {
      this.issues = [...this.issues, sub];
    };
    this.addIssues = (subs = []) => {
      this.issues = [...this.issues, ...subs];
    };
    const actualProto = new.target.prototype;
    if (Object.setPrototypeOf) {
      Object.setPrototypeOf(this, actualProto);
    } else {
      this.__proto__ = actualProto;
    }
    this.name = "ZodError";
    this.issues = issues;
  }
  format(_mapper) {
    const mapper = _mapper || function(issue) {
      return issue.message;
    };
    const fieldErrors = { _errors: [] };
    const processError = (error) => {
      for (const issue of error.issues) {
        if (issue.code === "invalid_union") {
          issue.unionErrors.map(processError);
        } else if (issue.code === "invalid_return_type") {
          processError(issue.returnTypeError);
        } else if (issue.code === "invalid_arguments") {
          processError(issue.argumentsError);
        } else if (issue.path.length === 0) {
          fieldErrors._errors.push(mapper(issue));
        } else {
          let curr = fieldErrors;
          let i = 0;
          while (i < issue.path.length) {
            const el = issue.path[i];
            const terminal = i === issue.path.length - 1;
            if (!terminal) {
              curr[el] = curr[el] || { _errors: [] };
            } else {
              curr[el] = curr[el] || { _errors: [] };
              curr[el]._errors.push(mapper(issue));
            }
            curr = curr[el];
            i++;
          }
        }
      }
    };
    processError(this);
    return fieldErrors;
  }
  static assert(value) {
    if (!(value instanceof _ZodError)) {
      throw new Error(`Not a ZodError: ${value}`);
    }
  }
  toString() {
    return this.message;
  }
  get message() {
    return JSON.stringify(this.issues, util.jsonStringifyReplacer, 2);
  }
  get isEmpty() {
    return this.issues.length === 0;
  }
  flatten(mapper = (issue) => issue.message) {
    const fieldErrors = {};
    const formErrors = [];
    for (const sub of this.issues) {
      if (sub.path.length > 0) {
        fieldErrors[sub.path[0]] = fieldErrors[sub.path[0]] || [];
        fieldErrors[sub.path[0]].push(mapper(sub));
      } else {
        formErrors.push(mapper(sub));
      }
    }
    return { formErrors, fieldErrors };
  }
  get formErrors() {
    return this.flatten();
  }
};
ZodError.create = (issues) => {
  const error = new ZodError(issues);
  return error;
};
var errorMap = (issue, _ctx) => {
  let message;
  switch (issue.code) {
    case ZodIssueCode.invalid_type:
      if (issue.received === ZodParsedType.undefined) {
        message = "Required";
      } else {
        message = `Expected ${issue.expected}, received ${issue.received}`;
      }
      break;
    case ZodIssueCode.invalid_literal:
      message = `Invalid literal value, expected ${JSON.stringify(issue.expected, util.jsonStringifyReplacer)}`;
      break;
    case ZodIssueCode.unrecognized_keys:
      message = `Unrecognized key(s) in object: ${util.joinValues(issue.keys, ", ")}`;
      break;
    case ZodIssueCode.invalid_union:
      message = `Invalid input`;
      break;
    case ZodIssueCode.invalid_union_discriminator:
      message = `Invalid discriminator value. Expected ${util.joinValues(issue.options)}`;
      break;
    case ZodIssueCode.invalid_enum_value:
      message = `Invalid enum value. Expected ${util.joinValues(issue.options)}, received '${issue.received}'`;
      break;
    case ZodIssueCode.invalid_arguments:
      message = `Invalid function arguments`;
      break;
    case ZodIssueCode.invalid_return_type:
      message = `Invalid function return type`;
      break;
    case ZodIssueCode.invalid_date:
      message = `Invalid date`;
      break;
    case ZodIssueCode.invalid_string:
      if (typeof issue.validation === "object") {
        if ("includes" in issue.validation) {
          message = `Invalid input: must include "${issue.validation.includes}"`;
          if (typeof issue.validation.position === "number") {
            message = `${message} at one or more positions greater than or equal to ${issue.validation.position}`;
          }
        } else if ("startsWith" in issue.validation) {
          message = `Invalid input: must start with "${issue.validation.startsWith}"`;
        } else if ("endsWith" in issue.validation) {
          message = `Invalid input: must end with "${issue.validation.endsWith}"`;
        } else {
          util.assertNever(issue.validation);
        }
      } else if (issue.validation !== "regex") {
        message = `Invalid ${issue.validation}`;
      } else {
        message = "Invalid";
      }
      break;
    case ZodIssueCode.too_small:
      if (issue.type === "array")
        message = `Array must contain ${issue.exact ? "exactly" : issue.inclusive ? `at least` : `more than`} ${issue.minimum} element(s)`;
      else if (issue.type === "string")
        message = `String must contain ${issue.exact ? "exactly" : issue.inclusive ? `at least` : `over`} ${issue.minimum} character(s)`;
      else if (issue.type === "number")
        message = `Number must be ${issue.exact ? `exactly equal to ` : issue.inclusive ? `greater than or equal to ` : `greater than `}${issue.minimum}`;
      else if (issue.type === "date")
        message = `Date must be ${issue.exact ? `exactly equal to ` : issue.inclusive ? `greater than or equal to ` : `greater than `}${new Date(Number(issue.minimum))}`;
      else
        message = "Invalid input";
      break;
    case ZodIssueCode.too_big:
      if (issue.type === "array")
        message = `Array must contain ${issue.exact ? `exactly` : issue.inclusive ? `at most` : `less than`} ${issue.maximum} element(s)`;
      else if (issue.type === "string")
        message = `String must contain ${issue.exact ? `exactly` : issue.inclusive ? `at most` : `under`} ${issue.maximum} character(s)`;
      else if (issue.type === "number")
        message = `Number must be ${issue.exact ? `exactly` : issue.inclusive ? `less than or equal to` : `less than`} ${issue.maximum}`;
      else if (issue.type === "bigint")
        message = `BigInt must be ${issue.exact ? `exactly` : issue.inclusive ? `less than or equal to` : `less than`} ${issue.maximum}`;
      else if (issue.type === "date")
        message = `Date must be ${issue.exact ? `exactly` : issue.inclusive ? `smaller than or equal to` : `smaller than`} ${new Date(Number(issue.maximum))}`;
      else
        message = "Invalid input";
      break;
    case ZodIssueCode.custom:
      message = `Invalid input`;
      break;
    case ZodIssueCode.invalid_intersection_types:
      message = `Intersection results could not be merged`;
      break;
    case ZodIssueCode.not_multiple_of:
      message = `Number must be a multiple of ${issue.multipleOf}`;
      break;
    case ZodIssueCode.not_finite:
      message = "Number must be finite";
      break;
    default:
      message = _ctx.defaultError;
      util.assertNever(issue);
  }
  return { message };
};
var overrideErrorMap = errorMap;
function setErrorMap(map) {
  overrideErrorMap = map;
}
function getErrorMap() {
  return overrideErrorMap;
}
var makeIssue = (params) => {
  const { data, path: path5, errorMaps, issueData } = params;
  const fullPath = [...path5, ...issueData.path || []];
  const fullIssue = {
    ...issueData,
    path: fullPath
  };
  if (issueData.message !== void 0) {
    return {
      ...issueData,
      path: fullPath,
      message: issueData.message
    };
  }
  let errorMessage = "";
  const maps = errorMaps.filter((m) => !!m).slice().reverse();
  for (const map of maps) {
    errorMessage = map(fullIssue, { data, defaultError: errorMessage }).message;
  }
  return {
    ...issueData,
    path: fullPath,
    message: errorMessage
  };
};
var EMPTY_PATH = [];
function addIssueToContext(ctx, issueData) {
  const overrideMap = getErrorMap();
  const issue = makeIssue({
    issueData,
    data: ctx.data,
    path: ctx.path,
    errorMaps: [
      ctx.common.contextualErrorMap,
      // contextual error map is first priority
      ctx.schemaErrorMap,
      // then schema-bound map if available
      overrideMap,
      // then global override map
      overrideMap === errorMap ? void 0 : errorMap
      // then global default map
    ].filter((x) => !!x)
  });
  ctx.common.issues.push(issue);
}
var ParseStatus = class _ParseStatus {
  constructor() {
    this.value = "valid";
  }
  dirty() {
    if (this.value === "valid")
      this.value = "dirty";
  }
  abort() {
    if (this.value !== "aborted")
      this.value = "aborted";
  }
  static mergeArray(status, results) {
    const arrayValue = [];
    for (const s of results) {
      if (s.status === "aborted")
        return INVALID;
      if (s.status === "dirty")
        status.dirty();
      arrayValue.push(s.value);
    }
    return { status: status.value, value: arrayValue };
  }
  static async mergeObjectAsync(status, pairs) {
    const syncPairs = [];
    for (const pair of pairs) {
      const key = await pair.key;
      const value = await pair.value;
      syncPairs.push({
        key,
        value
      });
    }
    return _ParseStatus.mergeObjectSync(status, syncPairs);
  }
  static mergeObjectSync(status, pairs) {
    const finalObject = {};
    for (const pair of pairs) {
      const { key, value } = pair;
      if (key.status === "aborted")
        return INVALID;
      if (value.status === "aborted")
        return INVALID;
      if (key.status === "dirty")
        status.dirty();
      if (value.status === "dirty")
        status.dirty();
      if (key.value !== "__proto__" && (typeof value.value !== "undefined" || pair.alwaysSet)) {
        finalObject[key.value] = value.value;
      }
    }
    return { status: status.value, value: finalObject };
  }
};
var INVALID = Object.freeze({
  status: "aborted"
});
var DIRTY = (value) => ({ status: "dirty", value });
var OK = (value) => ({ status: "valid", value });
var isAborted = (x) => x.status === "aborted";
var isDirty = (x) => x.status === "dirty";
var isValid = (x) => x.status === "valid";
var isAsync = (x) => typeof Promise !== "undefined" && x instanceof Promise;
function __classPrivateFieldGet(receiver, state, kind, f) {
  if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a getter");
  if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot read private member from an object whose class did not declare it");
  return kind === "m" ? f : kind === "a" ? f.call(receiver) : f ? f.value : state.get(receiver);
}
function __classPrivateFieldSet(receiver, state, value, kind, f) {
  if (kind === "m") throw new TypeError("Private method is not writable");
  if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a setter");
  if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot write private member to an object whose class did not declare it");
  return kind === "a" ? f.call(receiver, value) : f ? f.value = value : state.set(receiver, value), value;
}
var errorUtil;
(function(errorUtil2) {
  errorUtil2.errToObj = (message) => typeof message === "string" ? { message } : message || {};
  errorUtil2.toString = (message) => typeof message === "string" ? message : message === null || message === void 0 ? void 0 : message.message;
})(errorUtil || (errorUtil = {}));
var _ZodEnum_cache;
var _ZodNativeEnum_cache;
var ParseInputLazyPath = class {
  constructor(parent, value, path5, key) {
    this._cachedPath = [];
    this.parent = parent;
    this.data = value;
    this._path = path5;
    this._key = key;
  }
  get path() {
    if (!this._cachedPath.length) {
      if (this._key instanceof Array) {
        this._cachedPath.push(...this._path, ...this._key);
      } else {
        this._cachedPath.push(...this._path, this._key);
      }
    }
    return this._cachedPath;
  }
};
var handleResult = (ctx, result) => {
  if (isValid(result)) {
    return { success: true, data: result.value };
  } else {
    if (!ctx.common.issues.length) {
      throw new Error("Validation failed but no issues detected.");
    }
    return {
      success: false,
      get error() {
        if (this._error)
          return this._error;
        const error = new ZodError(ctx.common.issues);
        this._error = error;
        return this._error;
      }
    };
  }
};
function processCreateParams(params) {
  if (!params)
    return {};
  const { errorMap: errorMap2, invalid_type_error, required_error, description } = params;
  if (errorMap2 && (invalid_type_error || required_error)) {
    throw new Error(`Can't use "invalid_type_error" or "required_error" in conjunction with custom error map.`);
  }
  if (errorMap2)
    return { errorMap: errorMap2, description };
  const customMap = (iss, ctx) => {
    var _a, _b;
    const { message } = params;
    if (iss.code === "invalid_enum_value") {
      return { message: message !== null && message !== void 0 ? message : ctx.defaultError };
    }
    if (typeof ctx.data === "undefined") {
      return { message: (_a = message !== null && message !== void 0 ? message : required_error) !== null && _a !== void 0 ? _a : ctx.defaultError };
    }
    if (iss.code !== "invalid_type")
      return { message: ctx.defaultError };
    return { message: (_b = message !== null && message !== void 0 ? message : invalid_type_error) !== null && _b !== void 0 ? _b : ctx.defaultError };
  };
  return { errorMap: customMap, description };
}
var ZodType = class {
  get description() {
    return this._def.description;
  }
  _getType(input) {
    return getParsedType(input.data);
  }
  _getOrReturnCtx(input, ctx) {
    return ctx || {
      common: input.parent.common,
      data: input.data,
      parsedType: getParsedType(input.data),
      schemaErrorMap: this._def.errorMap,
      path: input.path,
      parent: input.parent
    };
  }
  _processInputParams(input) {
    return {
      status: new ParseStatus(),
      ctx: {
        common: input.parent.common,
        data: input.data,
        parsedType: getParsedType(input.data),
        schemaErrorMap: this._def.errorMap,
        path: input.path,
        parent: input.parent
      }
    };
  }
  _parseSync(input) {
    const result = this._parse(input);
    if (isAsync(result)) {
      throw new Error("Synchronous parse encountered promise.");
    }
    return result;
  }
  _parseAsync(input) {
    const result = this._parse(input);
    return Promise.resolve(result);
  }
  parse(data, params) {
    const result = this.safeParse(data, params);
    if (result.success)
      return result.data;
    throw result.error;
  }
  safeParse(data, params) {
    var _a;
    const ctx = {
      common: {
        issues: [],
        async: (_a = params === null || params === void 0 ? void 0 : params.async) !== null && _a !== void 0 ? _a : false,
        contextualErrorMap: params === null || params === void 0 ? void 0 : params.errorMap
      },
      path: (params === null || params === void 0 ? void 0 : params.path) || [],
      schemaErrorMap: this._def.errorMap,
      parent: null,
      data,
      parsedType: getParsedType(data)
    };
    const result = this._parseSync({ data, path: ctx.path, parent: ctx });
    return handleResult(ctx, result);
  }
  "~validate"(data) {
    var _a, _b;
    const ctx = {
      common: {
        issues: [],
        async: !!this["~standard"].async
      },
      path: [],
      schemaErrorMap: this._def.errorMap,
      parent: null,
      data,
      parsedType: getParsedType(data)
    };
    if (!this["~standard"].async) {
      try {
        const result = this._parseSync({ data, path: [], parent: ctx });
        return isValid(result) ? {
          value: result.value
        } : {
          issues: ctx.common.issues
        };
      } catch (err) {
        if ((_b = (_a = err === null || err === void 0 ? void 0 : err.message) === null || _a === void 0 ? void 0 : _a.toLowerCase()) === null || _b === void 0 ? void 0 : _b.includes("encountered")) {
          this["~standard"].async = true;
        }
        ctx.common = {
          issues: [],
          async: true
        };
      }
    }
    return this._parseAsync({ data, path: [], parent: ctx }).then((result) => isValid(result) ? {
      value: result.value
    } : {
      issues: ctx.common.issues
    });
  }
  async parseAsync(data, params) {
    const result = await this.safeParseAsync(data, params);
    if (result.success)
      return result.data;
    throw result.error;
  }
  async safeParseAsync(data, params) {
    const ctx = {
      common: {
        issues: [],
        contextualErrorMap: params === null || params === void 0 ? void 0 : params.errorMap,
        async: true
      },
      path: (params === null || params === void 0 ? void 0 : params.path) || [],
      schemaErrorMap: this._def.errorMap,
      parent: null,
      data,
      parsedType: getParsedType(data)
    };
    const maybeAsyncResult = this._parse({ data, path: ctx.path, parent: ctx });
    const result = await (isAsync(maybeAsyncResult) ? maybeAsyncResult : Promise.resolve(maybeAsyncResult));
    return handleResult(ctx, result);
  }
  refine(check, message) {
    const getIssueProperties = (val) => {
      if (typeof message === "string" || typeof message === "undefined") {
        return { message };
      } else if (typeof message === "function") {
        return message(val);
      } else {
        return message;
      }
    };
    return this._refinement((val, ctx) => {
      const result = check(val);
      const setError = () => ctx.addIssue({
        code: ZodIssueCode.custom,
        ...getIssueProperties(val)
      });
      if (typeof Promise !== "undefined" && result instanceof Promise) {
        return result.then((data) => {
          if (!data) {
            setError();
            return false;
          } else {
            return true;
          }
        });
      }
      if (!result) {
        setError();
        return false;
      } else {
        return true;
      }
    });
  }
  refinement(check, refinementData) {
    return this._refinement((val, ctx) => {
      if (!check(val)) {
        ctx.addIssue(typeof refinementData === "function" ? refinementData(val, ctx) : refinementData);
        return false;
      } else {
        return true;
      }
    });
  }
  _refinement(refinement) {
    return new ZodEffects({
      schema: this,
      typeName: ZodFirstPartyTypeKind.ZodEffects,
      effect: { type: "refinement", refinement }
    });
  }
  superRefine(refinement) {
    return this._refinement(refinement);
  }
  constructor(def) {
    this.spa = this.safeParseAsync;
    this._def = def;
    this.parse = this.parse.bind(this);
    this.safeParse = this.safeParse.bind(this);
    this.parseAsync = this.parseAsync.bind(this);
    this.safeParseAsync = this.safeParseAsync.bind(this);
    this.spa = this.spa.bind(this);
    this.refine = this.refine.bind(this);
    this.refinement = this.refinement.bind(this);
    this.superRefine = this.superRefine.bind(this);
    this.optional = this.optional.bind(this);
    this.nullable = this.nullable.bind(this);
    this.nullish = this.nullish.bind(this);
    this.array = this.array.bind(this);
    this.promise = this.promise.bind(this);
    this.or = this.or.bind(this);
    this.and = this.and.bind(this);
    this.transform = this.transform.bind(this);
    this.brand = this.brand.bind(this);
    this.default = this.default.bind(this);
    this.catch = this.catch.bind(this);
    this.describe = this.describe.bind(this);
    this.pipe = this.pipe.bind(this);
    this.readonly = this.readonly.bind(this);
    this.isNullable = this.isNullable.bind(this);
    this.isOptional = this.isOptional.bind(this);
    this["~standard"] = {
      version: 1,
      vendor: "zod",
      validate: (data) => this["~validate"](data)
    };
  }
  optional() {
    return ZodOptional.create(this, this._def);
  }
  nullable() {
    return ZodNullable.create(this, this._def);
  }
  nullish() {
    return this.nullable().optional();
  }
  array() {
    return ZodArray.create(this);
  }
  promise() {
    return ZodPromise.create(this, this._def);
  }
  or(option) {
    return ZodUnion.create([this, option], this._def);
  }
  and(incoming) {
    return ZodIntersection.create(this, incoming, this._def);
  }
  transform(transform) {
    return new ZodEffects({
      ...processCreateParams(this._def),
      schema: this,
      typeName: ZodFirstPartyTypeKind.ZodEffects,
      effect: { type: "transform", transform }
    });
  }
  default(def) {
    const defaultValueFunc = typeof def === "function" ? def : () => def;
    return new ZodDefault({
      ...processCreateParams(this._def),
      innerType: this,
      defaultValue: defaultValueFunc,
      typeName: ZodFirstPartyTypeKind.ZodDefault
    });
  }
  brand() {
    return new ZodBranded({
      typeName: ZodFirstPartyTypeKind.ZodBranded,
      type: this,
      ...processCreateParams(this._def)
    });
  }
  catch(def) {
    const catchValueFunc = typeof def === "function" ? def : () => def;
    return new ZodCatch({
      ...processCreateParams(this._def),
      innerType: this,
      catchValue: catchValueFunc,
      typeName: ZodFirstPartyTypeKind.ZodCatch
    });
  }
  describe(description) {
    const This = this.constructor;
    return new This({
      ...this._def,
      description
    });
  }
  pipe(target) {
    return ZodPipeline.create(this, target);
  }
  readonly() {
    return ZodReadonly.create(this);
  }
  isOptional() {
    return this.safeParse(void 0).success;
  }
  isNullable() {
    return this.safeParse(null).success;
  }
};
var cuidRegex = /^c[^\s-]{8,}$/i;
var cuid2Regex = /^[0-9a-z]+$/;
var ulidRegex = /^[0-9A-HJKMNP-TV-Z]{26}$/i;
var uuidRegex = /^[0-9a-fA-F]{8}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{12}$/i;
var nanoidRegex = /^[a-z0-9_-]{21}$/i;
var jwtRegex = /^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]*$/;
var durationRegex = /^[-+]?P(?!$)(?:(?:[-+]?\d+Y)|(?:[-+]?\d+[.,]\d+Y$))?(?:(?:[-+]?\d+M)|(?:[-+]?\d+[.,]\d+M$))?(?:(?:[-+]?\d+W)|(?:[-+]?\d+[.,]\d+W$))?(?:(?:[-+]?\d+D)|(?:[-+]?\d+[.,]\d+D$))?(?:T(?=[\d+-])(?:(?:[-+]?\d+H)|(?:[-+]?\d+[.,]\d+H$))?(?:(?:[-+]?\d+M)|(?:[-+]?\d+[.,]\d+M$))?(?:[-+]?\d+(?:[.,]\d+)?S)?)??$/;
var emailRegex = /^(?!\.)(?!.*\.\.)([A-Z0-9_'+\-\.]*)[A-Z0-9_+-]@([A-Z0-9][A-Z0-9\-]*\.)+[A-Z]{2,}$/i;
var _emojiRegex = `^(\\p{Extended_Pictographic}|\\p{Emoji_Component})+$`;
var emojiRegex;
var ipv4Regex = /^(?:(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\.){3}(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])$/;
var ipv4CidrRegex = /^(?:(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\.){3}(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\/(3[0-2]|[12]?[0-9])$/;
var ipv6Regex = /^(([0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|::(ffff(:0{1,4}){0,1}:){0,1}((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9]))$/;
var ipv6CidrRegex = /^(([0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|::(ffff(:0{1,4}){0,1}:){0,1}((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9]))\/(12[0-8]|1[01][0-9]|[1-9]?[0-9])$/;
var base64Regex = /^([0-9a-zA-Z+/]{4})*(([0-9a-zA-Z+/]{2}==)|([0-9a-zA-Z+/]{3}=))?$/;
var base64urlRegex = /^([0-9a-zA-Z-_]{4})*(([0-9a-zA-Z-_]{2}(==)?)|([0-9a-zA-Z-_]{3}(=)?))?$/;
var dateRegexSource = `((\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-((0[13578]|1[02])-(0[1-9]|[12]\\d|3[01])|(0[469]|11)-(0[1-9]|[12]\\d|30)|(02)-(0[1-9]|1\\d|2[0-8])))`;
var dateRegex = new RegExp(`^${dateRegexSource}$`);
function timeRegexSource(args) {
  let regex = `([01]\\d|2[0-3]):[0-5]\\d:[0-5]\\d`;
  if (args.precision) {
    regex = `${regex}\\.\\d{${args.precision}}`;
  } else if (args.precision == null) {
    regex = `${regex}(\\.\\d+)?`;
  }
  return regex;
}
function timeRegex(args) {
  return new RegExp(`^${timeRegexSource(args)}$`);
}
function datetimeRegex(args) {
  let regex = `${dateRegexSource}T${timeRegexSource(args)}`;
  const opts = [];
  opts.push(args.local ? `Z?` : `Z`);
  if (args.offset)
    opts.push(`([+-]\\d{2}:?\\d{2})`);
  regex = `${regex}(${opts.join("|")})`;
  return new RegExp(`^${regex}$`);
}
function isValidIP(ip, version) {
  if ((version === "v4" || !version) && ipv4Regex.test(ip)) {
    return true;
  }
  if ((version === "v6" || !version) && ipv6Regex.test(ip)) {
    return true;
  }
  return false;
}
function isValidJWT(jwt, alg) {
  if (!jwtRegex.test(jwt))
    return false;
  try {
    const [header] = jwt.split(".");
    const base64 = header.replace(/-/g, "+").replace(/_/g, "/").padEnd(header.length + (4 - header.length % 4) % 4, "=");
    const decoded = JSON.parse(atob(base64));
    if (typeof decoded !== "object" || decoded === null)
      return false;
    if (!decoded.typ || !decoded.alg)
      return false;
    if (alg && decoded.alg !== alg)
      return false;
    return true;
  } catch (_a) {
    return false;
  }
}
function isValidCidr(ip, version) {
  if ((version === "v4" || !version) && ipv4CidrRegex.test(ip)) {
    return true;
  }
  if ((version === "v6" || !version) && ipv6CidrRegex.test(ip)) {
    return true;
  }
  return false;
}
var ZodString = class _ZodString extends ZodType {
  _parse(input) {
    if (this._def.coerce) {
      input.data = String(input.data);
    }
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.string) {
      const ctx2 = this._getOrReturnCtx(input);
      addIssueToContext(ctx2, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.string,
        received: ctx2.parsedType
      });
      return INVALID;
    }
    const status = new ParseStatus();
    let ctx = void 0;
    for (const check of this._def.checks) {
      if (check.kind === "min") {
        if (input.data.length < check.value) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_small,
            minimum: check.value,
            type: "string",
            inclusive: true,
            exact: false,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "max") {
        if (input.data.length > check.value) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_big,
            maximum: check.value,
            type: "string",
            inclusive: true,
            exact: false,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "length") {
        const tooBig = input.data.length > check.value;
        const tooSmall = input.data.length < check.value;
        if (tooBig || tooSmall) {
          ctx = this._getOrReturnCtx(input, ctx);
          if (tooBig) {
            addIssueToContext(ctx, {
              code: ZodIssueCode.too_big,
              maximum: check.value,
              type: "string",
              inclusive: true,
              exact: true,
              message: check.message
            });
          } else if (tooSmall) {
            addIssueToContext(ctx, {
              code: ZodIssueCode.too_small,
              minimum: check.value,
              type: "string",
              inclusive: true,
              exact: true,
              message: check.message
            });
          }
          status.dirty();
        }
      } else if (check.kind === "email") {
        if (!emailRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "email",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "emoji") {
        if (!emojiRegex) {
          emojiRegex = new RegExp(_emojiRegex, "u");
        }
        if (!emojiRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "emoji",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "uuid") {
        if (!uuidRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "uuid",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "nanoid") {
        if (!nanoidRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "nanoid",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "cuid") {
        if (!cuidRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "cuid",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "cuid2") {
        if (!cuid2Regex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "cuid2",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "ulid") {
        if (!ulidRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "ulid",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "url") {
        try {
          new URL(input.data);
        } catch (_a) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "url",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "regex") {
        check.regex.lastIndex = 0;
        const testResult = check.regex.test(input.data);
        if (!testResult) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "regex",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "trim") {
        input.data = input.data.trim();
      } else if (check.kind === "includes") {
        if (!input.data.includes(check.value, check.position)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_string,
            validation: { includes: check.value, position: check.position },
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "toLowerCase") {
        input.data = input.data.toLowerCase();
      } else if (check.kind === "toUpperCase") {
        input.data = input.data.toUpperCase();
      } else if (check.kind === "startsWith") {
        if (!input.data.startsWith(check.value)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_string,
            validation: { startsWith: check.value },
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "endsWith") {
        if (!input.data.endsWith(check.value)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_string,
            validation: { endsWith: check.value },
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "datetime") {
        const regex = datetimeRegex(check);
        if (!regex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_string,
            validation: "datetime",
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "date") {
        const regex = dateRegex;
        if (!regex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_string,
            validation: "date",
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "time") {
        const regex = timeRegex(check);
        if (!regex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_string,
            validation: "time",
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "duration") {
        if (!durationRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "duration",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "ip") {
        if (!isValidIP(input.data, check.version)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "ip",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "jwt") {
        if (!isValidJWT(input.data, check.alg)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "jwt",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "cidr") {
        if (!isValidCidr(input.data, check.version)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "cidr",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "base64") {
        if (!base64Regex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "base64",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "base64url") {
        if (!base64urlRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "base64url",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else {
        util.assertNever(check);
      }
    }
    return { status: status.value, value: input.data };
  }
  _regex(regex, validation, message) {
    return this.refinement((data) => regex.test(data), {
      validation,
      code: ZodIssueCode.invalid_string,
      ...errorUtil.errToObj(message)
    });
  }
  _addCheck(check) {
    return new _ZodString({
      ...this._def,
      checks: [...this._def.checks, check]
    });
  }
  email(message) {
    return this._addCheck({ kind: "email", ...errorUtil.errToObj(message) });
  }
  url(message) {
    return this._addCheck({ kind: "url", ...errorUtil.errToObj(message) });
  }
  emoji(message) {
    return this._addCheck({ kind: "emoji", ...errorUtil.errToObj(message) });
  }
  uuid(message) {
    return this._addCheck({ kind: "uuid", ...errorUtil.errToObj(message) });
  }
  nanoid(message) {
    return this._addCheck({ kind: "nanoid", ...errorUtil.errToObj(message) });
  }
  cuid(message) {
    return this._addCheck({ kind: "cuid", ...errorUtil.errToObj(message) });
  }
  cuid2(message) {
    return this._addCheck({ kind: "cuid2", ...errorUtil.errToObj(message) });
  }
  ulid(message) {
    return this._addCheck({ kind: "ulid", ...errorUtil.errToObj(message) });
  }
  base64(message) {
    return this._addCheck({ kind: "base64", ...errorUtil.errToObj(message) });
  }
  base64url(message) {
    return this._addCheck({
      kind: "base64url",
      ...errorUtil.errToObj(message)
    });
  }
  jwt(options) {
    return this._addCheck({ kind: "jwt", ...errorUtil.errToObj(options) });
  }
  ip(options) {
    return this._addCheck({ kind: "ip", ...errorUtil.errToObj(options) });
  }
  cidr(options) {
    return this._addCheck({ kind: "cidr", ...errorUtil.errToObj(options) });
  }
  datetime(options) {
    var _a, _b;
    if (typeof options === "string") {
      return this._addCheck({
        kind: "datetime",
        precision: null,
        offset: false,
        local: false,
        message: options
      });
    }
    return this._addCheck({
      kind: "datetime",
      precision: typeof (options === null || options === void 0 ? void 0 : options.precision) === "undefined" ? null : options === null || options === void 0 ? void 0 : options.precision,
      offset: (_a = options === null || options === void 0 ? void 0 : options.offset) !== null && _a !== void 0 ? _a : false,
      local: (_b = options === null || options === void 0 ? void 0 : options.local) !== null && _b !== void 0 ? _b : false,
      ...errorUtil.errToObj(options === null || options === void 0 ? void 0 : options.message)
    });
  }
  date(message) {
    return this._addCheck({ kind: "date", message });
  }
  time(options) {
    if (typeof options === "string") {
      return this._addCheck({
        kind: "time",
        precision: null,
        message: options
      });
    }
    return this._addCheck({
      kind: "time",
      precision: typeof (options === null || options === void 0 ? void 0 : options.precision) === "undefined" ? null : options === null || options === void 0 ? void 0 : options.precision,
      ...errorUtil.errToObj(options === null || options === void 0 ? void 0 : options.message)
    });
  }
  duration(message) {
    return this._addCheck({ kind: "duration", ...errorUtil.errToObj(message) });
  }
  regex(regex, message) {
    return this._addCheck({
      kind: "regex",
      regex,
      ...errorUtil.errToObj(message)
    });
  }
  includes(value, options) {
    return this._addCheck({
      kind: "includes",
      value,
      position: options === null || options === void 0 ? void 0 : options.position,
      ...errorUtil.errToObj(options === null || options === void 0 ? void 0 : options.message)
    });
  }
  startsWith(value, message) {
    return this._addCheck({
      kind: "startsWith",
      value,
      ...errorUtil.errToObj(message)
    });
  }
  endsWith(value, message) {
    return this._addCheck({
      kind: "endsWith",
      value,
      ...errorUtil.errToObj(message)
    });
  }
  min(minLength, message) {
    return this._addCheck({
      kind: "min",
      value: minLength,
      ...errorUtil.errToObj(message)
    });
  }
  max(maxLength, message) {
    return this._addCheck({
      kind: "max",
      value: maxLength,
      ...errorUtil.errToObj(message)
    });
  }
  length(len, message) {
    return this._addCheck({
      kind: "length",
      value: len,
      ...errorUtil.errToObj(message)
    });
  }
  /**
   * Equivalent to `.min(1)`
   */
  nonempty(message) {
    return this.min(1, errorUtil.errToObj(message));
  }
  trim() {
    return new _ZodString({
      ...this._def,
      checks: [...this._def.checks, { kind: "trim" }]
    });
  }
  toLowerCase() {
    return new _ZodString({
      ...this._def,
      checks: [...this._def.checks, { kind: "toLowerCase" }]
    });
  }
  toUpperCase() {
    return new _ZodString({
      ...this._def,
      checks: [...this._def.checks, { kind: "toUpperCase" }]
    });
  }
  get isDatetime() {
    return !!this._def.checks.find((ch) => ch.kind === "datetime");
  }
  get isDate() {
    return !!this._def.checks.find((ch) => ch.kind === "date");
  }
  get isTime() {
    return !!this._def.checks.find((ch) => ch.kind === "time");
  }
  get isDuration() {
    return !!this._def.checks.find((ch) => ch.kind === "duration");
  }
  get isEmail() {
    return !!this._def.checks.find((ch) => ch.kind === "email");
  }
  get isURL() {
    return !!this._def.checks.find((ch) => ch.kind === "url");
  }
  get isEmoji() {
    return !!this._def.checks.find((ch) => ch.kind === "emoji");
  }
  get isUUID() {
    return !!this._def.checks.find((ch) => ch.kind === "uuid");
  }
  get isNANOID() {
    return !!this._def.checks.find((ch) => ch.kind === "nanoid");
  }
  get isCUID() {
    return !!this._def.checks.find((ch) => ch.kind === "cuid");
  }
  get isCUID2() {
    return !!this._def.checks.find((ch) => ch.kind === "cuid2");
  }
  get isULID() {
    return !!this._def.checks.find((ch) => ch.kind === "ulid");
  }
  get isIP() {
    return !!this._def.checks.find((ch) => ch.kind === "ip");
  }
  get isCIDR() {
    return !!this._def.checks.find((ch) => ch.kind === "cidr");
  }
  get isBase64() {
    return !!this._def.checks.find((ch) => ch.kind === "base64");
  }
  get isBase64url() {
    return !!this._def.checks.find((ch) => ch.kind === "base64url");
  }
  get minLength() {
    let min = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "min") {
        if (min === null || ch.value > min)
          min = ch.value;
      }
    }
    return min;
  }
  get maxLength() {
    let max = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "max") {
        if (max === null || ch.value < max)
          max = ch.value;
      }
    }
    return max;
  }
};
ZodString.create = (params) => {
  var _a;
  return new ZodString({
    checks: [],
    typeName: ZodFirstPartyTypeKind.ZodString,
    coerce: (_a = params === null || params === void 0 ? void 0 : params.coerce) !== null && _a !== void 0 ? _a : false,
    ...processCreateParams(params)
  });
};
function floatSafeRemainder(val, step) {
  const valDecCount = (val.toString().split(".")[1] || "").length;
  const stepDecCount = (step.toString().split(".")[1] || "").length;
  const decCount = valDecCount > stepDecCount ? valDecCount : stepDecCount;
  const valInt = parseInt(val.toFixed(decCount).replace(".", ""));
  const stepInt = parseInt(step.toFixed(decCount).replace(".", ""));
  return valInt % stepInt / Math.pow(10, decCount);
}
var ZodNumber = class _ZodNumber extends ZodType {
  constructor() {
    super(...arguments);
    this.min = this.gte;
    this.max = this.lte;
    this.step = this.multipleOf;
  }
  _parse(input) {
    if (this._def.coerce) {
      input.data = Number(input.data);
    }
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.number) {
      const ctx2 = this._getOrReturnCtx(input);
      addIssueToContext(ctx2, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.number,
        received: ctx2.parsedType
      });
      return INVALID;
    }
    let ctx = void 0;
    const status = new ParseStatus();
    for (const check of this._def.checks) {
      if (check.kind === "int") {
        if (!util.isInteger(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_type,
            expected: "integer",
            received: "float",
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "min") {
        const tooSmall = check.inclusive ? input.data < check.value : input.data <= check.value;
        if (tooSmall) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_small,
            minimum: check.value,
            type: "number",
            inclusive: check.inclusive,
            exact: false,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "max") {
        const tooBig = check.inclusive ? input.data > check.value : input.data >= check.value;
        if (tooBig) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_big,
            maximum: check.value,
            type: "number",
            inclusive: check.inclusive,
            exact: false,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "multipleOf") {
        if (floatSafeRemainder(input.data, check.value) !== 0) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.not_multiple_of,
            multipleOf: check.value,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "finite") {
        if (!Number.isFinite(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.not_finite,
            message: check.message
          });
          status.dirty();
        }
      } else {
        util.assertNever(check);
      }
    }
    return { status: status.value, value: input.data };
  }
  gte(value, message) {
    return this.setLimit("min", value, true, errorUtil.toString(message));
  }
  gt(value, message) {
    return this.setLimit("min", value, false, errorUtil.toString(message));
  }
  lte(value, message) {
    return this.setLimit("max", value, true, errorUtil.toString(message));
  }
  lt(value, message) {
    return this.setLimit("max", value, false, errorUtil.toString(message));
  }
  setLimit(kind, value, inclusive, message) {
    return new _ZodNumber({
      ...this._def,
      checks: [
        ...this._def.checks,
        {
          kind,
          value,
          inclusive,
          message: errorUtil.toString(message)
        }
      ]
    });
  }
  _addCheck(check) {
    return new _ZodNumber({
      ...this._def,
      checks: [...this._def.checks, check]
    });
  }
  int(message) {
    return this._addCheck({
      kind: "int",
      message: errorUtil.toString(message)
    });
  }
  positive(message) {
    return this._addCheck({
      kind: "min",
      value: 0,
      inclusive: false,
      message: errorUtil.toString(message)
    });
  }
  negative(message) {
    return this._addCheck({
      kind: "max",
      value: 0,
      inclusive: false,
      message: errorUtil.toString(message)
    });
  }
  nonpositive(message) {
    return this._addCheck({
      kind: "max",
      value: 0,
      inclusive: true,
      message: errorUtil.toString(message)
    });
  }
  nonnegative(message) {
    return this._addCheck({
      kind: "min",
      value: 0,
      inclusive: true,
      message: errorUtil.toString(message)
    });
  }
  multipleOf(value, message) {
    return this._addCheck({
      kind: "multipleOf",
      value,
      message: errorUtil.toString(message)
    });
  }
  finite(message) {
    return this._addCheck({
      kind: "finite",
      message: errorUtil.toString(message)
    });
  }
  safe(message) {
    return this._addCheck({
      kind: "min",
      inclusive: true,
      value: Number.MIN_SAFE_INTEGER,
      message: errorUtil.toString(message)
    })._addCheck({
      kind: "max",
      inclusive: true,
      value: Number.MAX_SAFE_INTEGER,
      message: errorUtil.toString(message)
    });
  }
  get minValue() {
    let min = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "min") {
        if (min === null || ch.value > min)
          min = ch.value;
      }
    }
    return min;
  }
  get maxValue() {
    let max = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "max") {
        if (max === null || ch.value < max)
          max = ch.value;
      }
    }
    return max;
  }
  get isInt() {
    return !!this._def.checks.find((ch) => ch.kind === "int" || ch.kind === "multipleOf" && util.isInteger(ch.value));
  }
  get isFinite() {
    let max = null, min = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "finite" || ch.kind === "int" || ch.kind === "multipleOf") {
        return true;
      } else if (ch.kind === "min") {
        if (min === null || ch.value > min)
          min = ch.value;
      } else if (ch.kind === "max") {
        if (max === null || ch.value < max)
          max = ch.value;
      }
    }
    return Number.isFinite(min) && Number.isFinite(max);
  }
};
ZodNumber.create = (params) => {
  return new ZodNumber({
    checks: [],
    typeName: ZodFirstPartyTypeKind.ZodNumber,
    coerce: (params === null || params === void 0 ? void 0 : params.coerce) || false,
    ...processCreateParams(params)
  });
};
var ZodBigInt = class _ZodBigInt extends ZodType {
  constructor() {
    super(...arguments);
    this.min = this.gte;
    this.max = this.lte;
  }
  _parse(input) {
    if (this._def.coerce) {
      try {
        input.data = BigInt(input.data);
      } catch (_a) {
        return this._getInvalidInput(input);
      }
    }
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.bigint) {
      return this._getInvalidInput(input);
    }
    let ctx = void 0;
    const status = new ParseStatus();
    for (const check of this._def.checks) {
      if (check.kind === "min") {
        const tooSmall = check.inclusive ? input.data < check.value : input.data <= check.value;
        if (tooSmall) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_small,
            type: "bigint",
            minimum: check.value,
            inclusive: check.inclusive,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "max") {
        const tooBig = check.inclusive ? input.data > check.value : input.data >= check.value;
        if (tooBig) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_big,
            type: "bigint",
            maximum: check.value,
            inclusive: check.inclusive,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "multipleOf") {
        if (input.data % check.value !== BigInt(0)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.not_multiple_of,
            multipleOf: check.value,
            message: check.message
          });
          status.dirty();
        }
      } else {
        util.assertNever(check);
      }
    }
    return { status: status.value, value: input.data };
  }
  _getInvalidInput(input) {
    const ctx = this._getOrReturnCtx(input);
    addIssueToContext(ctx, {
      code: ZodIssueCode.invalid_type,
      expected: ZodParsedType.bigint,
      received: ctx.parsedType
    });
    return INVALID;
  }
  gte(value, message) {
    return this.setLimit("min", value, true, errorUtil.toString(message));
  }
  gt(value, message) {
    return this.setLimit("min", value, false, errorUtil.toString(message));
  }
  lte(value, message) {
    return this.setLimit("max", value, true, errorUtil.toString(message));
  }
  lt(value, message) {
    return this.setLimit("max", value, false, errorUtil.toString(message));
  }
  setLimit(kind, value, inclusive, message) {
    return new _ZodBigInt({
      ...this._def,
      checks: [
        ...this._def.checks,
        {
          kind,
          value,
          inclusive,
          message: errorUtil.toString(message)
        }
      ]
    });
  }
  _addCheck(check) {
    return new _ZodBigInt({
      ...this._def,
      checks: [...this._def.checks, check]
    });
  }
  positive(message) {
    return this._addCheck({
      kind: "min",
      value: BigInt(0),
      inclusive: false,
      message: errorUtil.toString(message)
    });
  }
  negative(message) {
    return this._addCheck({
      kind: "max",
      value: BigInt(0),
      inclusive: false,
      message: errorUtil.toString(message)
    });
  }
  nonpositive(message) {
    return this._addCheck({
      kind: "max",
      value: BigInt(0),
      inclusive: true,
      message: errorUtil.toString(message)
    });
  }
  nonnegative(message) {
    return this._addCheck({
      kind: "min",
      value: BigInt(0),
      inclusive: true,
      message: errorUtil.toString(message)
    });
  }
  multipleOf(value, message) {
    return this._addCheck({
      kind: "multipleOf",
      value,
      message: errorUtil.toString(message)
    });
  }
  get minValue() {
    let min = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "min") {
        if (min === null || ch.value > min)
          min = ch.value;
      }
    }
    return min;
  }
  get maxValue() {
    let max = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "max") {
        if (max === null || ch.value < max)
          max = ch.value;
      }
    }
    return max;
  }
};
ZodBigInt.create = (params) => {
  var _a;
  return new ZodBigInt({
    checks: [],
    typeName: ZodFirstPartyTypeKind.ZodBigInt,
    coerce: (_a = params === null || params === void 0 ? void 0 : params.coerce) !== null && _a !== void 0 ? _a : false,
    ...processCreateParams(params)
  });
};
var ZodBoolean = class extends ZodType {
  _parse(input) {
    if (this._def.coerce) {
      input.data = Boolean(input.data);
    }
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.boolean) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.boolean,
        received: ctx.parsedType
      });
      return INVALID;
    }
    return OK(input.data);
  }
};
ZodBoolean.create = (params) => {
  return new ZodBoolean({
    typeName: ZodFirstPartyTypeKind.ZodBoolean,
    coerce: (params === null || params === void 0 ? void 0 : params.coerce) || false,
    ...processCreateParams(params)
  });
};
var ZodDate = class _ZodDate extends ZodType {
  _parse(input) {
    if (this._def.coerce) {
      input.data = new Date(input.data);
    }
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.date) {
      const ctx2 = this._getOrReturnCtx(input);
      addIssueToContext(ctx2, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.date,
        received: ctx2.parsedType
      });
      return INVALID;
    }
    if (isNaN(input.data.getTime())) {
      const ctx2 = this._getOrReturnCtx(input);
      addIssueToContext(ctx2, {
        code: ZodIssueCode.invalid_date
      });
      return INVALID;
    }
    const status = new ParseStatus();
    let ctx = void 0;
    for (const check of this._def.checks) {
      if (check.kind === "min") {
        if (input.data.getTime() < check.value) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_small,
            message: check.message,
            inclusive: true,
            exact: false,
            minimum: check.value,
            type: "date"
          });
          status.dirty();
        }
      } else if (check.kind === "max") {
        if (input.data.getTime() > check.value) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_big,
            message: check.message,
            inclusive: true,
            exact: false,
            maximum: check.value,
            type: "date"
          });
          status.dirty();
        }
      } else {
        util.assertNever(check);
      }
    }
    return {
      status: status.value,
      value: new Date(input.data.getTime())
    };
  }
  _addCheck(check) {
    return new _ZodDate({
      ...this._def,
      checks: [...this._def.checks, check]
    });
  }
  min(minDate, message) {
    return this._addCheck({
      kind: "min",
      value: minDate.getTime(),
      message: errorUtil.toString(message)
    });
  }
  max(maxDate, message) {
    return this._addCheck({
      kind: "max",
      value: maxDate.getTime(),
      message: errorUtil.toString(message)
    });
  }
  get minDate() {
    let min = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "min") {
        if (min === null || ch.value > min)
          min = ch.value;
      }
    }
    return min != null ? new Date(min) : null;
  }
  get maxDate() {
    let max = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "max") {
        if (max === null || ch.value < max)
          max = ch.value;
      }
    }
    return max != null ? new Date(max) : null;
  }
};
ZodDate.create = (params) => {
  return new ZodDate({
    checks: [],
    coerce: (params === null || params === void 0 ? void 0 : params.coerce) || false,
    typeName: ZodFirstPartyTypeKind.ZodDate,
    ...processCreateParams(params)
  });
};
var ZodSymbol = class extends ZodType {
  _parse(input) {
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.symbol) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.symbol,
        received: ctx.parsedType
      });
      return INVALID;
    }
    return OK(input.data);
  }
};
ZodSymbol.create = (params) => {
  return new ZodSymbol({
    typeName: ZodFirstPartyTypeKind.ZodSymbol,
    ...processCreateParams(params)
  });
};
var ZodUndefined = class extends ZodType {
  _parse(input) {
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.undefined) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.undefined,
        received: ctx.parsedType
      });
      return INVALID;
    }
    return OK(input.data);
  }
};
ZodUndefined.create = (params) => {
  return new ZodUndefined({
    typeName: ZodFirstPartyTypeKind.ZodUndefined,
    ...processCreateParams(params)
  });
};
var ZodNull = class extends ZodType {
  _parse(input) {
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.null) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.null,
        received: ctx.parsedType
      });
      return INVALID;
    }
    return OK(input.data);
  }
};
ZodNull.create = (params) => {
  return new ZodNull({
    typeName: ZodFirstPartyTypeKind.ZodNull,
    ...processCreateParams(params)
  });
};
var ZodAny = class extends ZodType {
  constructor() {
    super(...arguments);
    this._any = true;
  }
  _parse(input) {
    return OK(input.data);
  }
};
ZodAny.create = (params) => {
  return new ZodAny({
    typeName: ZodFirstPartyTypeKind.ZodAny,
    ...processCreateParams(params)
  });
};
var ZodUnknown = class extends ZodType {
  constructor() {
    super(...arguments);
    this._unknown = true;
  }
  _parse(input) {
    return OK(input.data);
  }
};
ZodUnknown.create = (params) => {
  return new ZodUnknown({
    typeName: ZodFirstPartyTypeKind.ZodUnknown,
    ...processCreateParams(params)
  });
};
var ZodNever = class extends ZodType {
  _parse(input) {
    const ctx = this._getOrReturnCtx(input);
    addIssueToContext(ctx, {
      code: ZodIssueCode.invalid_type,
      expected: ZodParsedType.never,
      received: ctx.parsedType
    });
    return INVALID;
  }
};
ZodNever.create = (params) => {
  return new ZodNever({
    typeName: ZodFirstPartyTypeKind.ZodNever,
    ...processCreateParams(params)
  });
};
var ZodVoid = class extends ZodType {
  _parse(input) {
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.undefined) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.void,
        received: ctx.parsedType
      });
      return INVALID;
    }
    return OK(input.data);
  }
};
ZodVoid.create = (params) => {
  return new ZodVoid({
    typeName: ZodFirstPartyTypeKind.ZodVoid,
    ...processCreateParams(params)
  });
};
var ZodArray = class _ZodArray extends ZodType {
  _parse(input) {
    const { ctx, status } = this._processInputParams(input);
    const def = this._def;
    if (ctx.parsedType !== ZodParsedType.array) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.array,
        received: ctx.parsedType
      });
      return INVALID;
    }
    if (def.exactLength !== null) {
      const tooBig = ctx.data.length > def.exactLength.value;
      const tooSmall = ctx.data.length < def.exactLength.value;
      if (tooBig || tooSmall) {
        addIssueToContext(ctx, {
          code: tooBig ? ZodIssueCode.too_big : ZodIssueCode.too_small,
          minimum: tooSmall ? def.exactLength.value : void 0,
          maximum: tooBig ? def.exactLength.value : void 0,
          type: "array",
          inclusive: true,
          exact: true,
          message: def.exactLength.message
        });
        status.dirty();
      }
    }
    if (def.minLength !== null) {
      if (ctx.data.length < def.minLength.value) {
        addIssueToContext(ctx, {
          code: ZodIssueCode.too_small,
          minimum: def.minLength.value,
          type: "array",
          inclusive: true,
          exact: false,
          message: def.minLength.message
        });
        status.dirty();
      }
    }
    if (def.maxLength !== null) {
      if (ctx.data.length > def.maxLength.value) {
        addIssueToContext(ctx, {
          code: ZodIssueCode.too_big,
          maximum: def.maxLength.value,
          type: "array",
          inclusive: true,
          exact: false,
          message: def.maxLength.message
        });
        status.dirty();
      }
    }
    if (ctx.common.async) {
      return Promise.all([...ctx.data].map((item, i) => {
        return def.type._parseAsync(new ParseInputLazyPath(ctx, item, ctx.path, i));
      })).then((result2) => {
        return ParseStatus.mergeArray(status, result2);
      });
    }
    const result = [...ctx.data].map((item, i) => {
      return def.type._parseSync(new ParseInputLazyPath(ctx, item, ctx.path, i));
    });
    return ParseStatus.mergeArray(status, result);
  }
  get element() {
    return this._def.type;
  }
  min(minLength, message) {
    return new _ZodArray({
      ...this._def,
      minLength: { value: minLength, message: errorUtil.toString(message) }
    });
  }
  max(maxLength, message) {
    return new _ZodArray({
      ...this._def,
      maxLength: { value: maxLength, message: errorUtil.toString(message) }
    });
  }
  length(len, message) {
    return new _ZodArray({
      ...this._def,
      exactLength: { value: len, message: errorUtil.toString(message) }
    });
  }
  nonempty(message) {
    return this.min(1, message);
  }
};
ZodArray.create = (schema, params) => {
  return new ZodArray({
    type: schema,
    minLength: null,
    maxLength: null,
    exactLength: null,
    typeName: ZodFirstPartyTypeKind.ZodArray,
    ...processCreateParams(params)
  });
};
function deepPartialify(schema) {
  if (schema instanceof ZodObject) {
    const newShape = {};
    for (const key in schema.shape) {
      const fieldSchema = schema.shape[key];
      newShape[key] = ZodOptional.create(deepPartialify(fieldSchema));
    }
    return new ZodObject({
      ...schema._def,
      shape: () => newShape
    });
  } else if (schema instanceof ZodArray) {
    return new ZodArray({
      ...schema._def,
      type: deepPartialify(schema.element)
    });
  } else if (schema instanceof ZodOptional) {
    return ZodOptional.create(deepPartialify(schema.unwrap()));
  } else if (schema instanceof ZodNullable) {
    return ZodNullable.create(deepPartialify(schema.unwrap()));
  } else if (schema instanceof ZodTuple) {
    return ZodTuple.create(schema.items.map((item) => deepPartialify(item)));
  } else {
    return schema;
  }
}
var ZodObject = class _ZodObject extends ZodType {
  constructor() {
    super(...arguments);
    this._cached = null;
    this.nonstrict = this.passthrough;
    this.augment = this.extend;
  }
  _getCached() {
    if (this._cached !== null)
      return this._cached;
    const shape = this._def.shape();
    const keys = util.objectKeys(shape);
    return this._cached = { shape, keys };
  }
  _parse(input) {
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.object) {
      const ctx2 = this._getOrReturnCtx(input);
      addIssueToContext(ctx2, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.object,
        received: ctx2.parsedType
      });
      return INVALID;
    }
    const { status, ctx } = this._processInputParams(input);
    const { shape, keys: shapeKeys } = this._getCached();
    const extraKeys = [];
    if (!(this._def.catchall instanceof ZodNever && this._def.unknownKeys === "strip")) {
      for (const key in ctx.data) {
        if (!shapeKeys.includes(key)) {
          extraKeys.push(key);
        }
      }
    }
    const pairs = [];
    for (const key of shapeKeys) {
      const keyValidator = shape[key];
      const value = ctx.data[key];
      pairs.push({
        key: { status: "valid", value: key },
        value: keyValidator._parse(new ParseInputLazyPath(ctx, value, ctx.path, key)),
        alwaysSet: key in ctx.data
      });
    }
    if (this._def.catchall instanceof ZodNever) {
      const unknownKeys = this._def.unknownKeys;
      if (unknownKeys === "passthrough") {
        for (const key of extraKeys) {
          pairs.push({
            key: { status: "valid", value: key },
            value: { status: "valid", value: ctx.data[key] }
          });
        }
      } else if (unknownKeys === "strict") {
        if (extraKeys.length > 0) {
          addIssueToContext(ctx, {
            code: ZodIssueCode.unrecognized_keys,
            keys: extraKeys
          });
          status.dirty();
        }
      } else if (unknownKeys === "strip") ;
      else {
        throw new Error(`Internal ZodObject error: invalid unknownKeys value.`);
      }
    } else {
      const catchall = this._def.catchall;
      for (const key of extraKeys) {
        const value = ctx.data[key];
        pairs.push({
          key: { status: "valid", value: key },
          value: catchall._parse(
            new ParseInputLazyPath(ctx, value, ctx.path, key)
            //, ctx.child(key), value, getParsedType(value)
          ),
          alwaysSet: key in ctx.data
        });
      }
    }
    if (ctx.common.async) {
      return Promise.resolve().then(async () => {
        const syncPairs = [];
        for (const pair of pairs) {
          const key = await pair.key;
          const value = await pair.value;
          syncPairs.push({
            key,
            value,
            alwaysSet: pair.alwaysSet
          });
        }
        return syncPairs;
      }).then((syncPairs) => {
        return ParseStatus.mergeObjectSync(status, syncPairs);
      });
    } else {
      return ParseStatus.mergeObjectSync(status, pairs);
    }
  }
  get shape() {
    return this._def.shape();
  }
  strict(message) {
    errorUtil.errToObj;
    return new _ZodObject({
      ...this._def,
      unknownKeys: "strict",
      ...message !== void 0 ? {
        errorMap: (issue, ctx) => {
          var _a, _b, _c, _d;
          const defaultError = (_c = (_b = (_a = this._def).errorMap) === null || _b === void 0 ? void 0 : _b.call(_a, issue, ctx).message) !== null && _c !== void 0 ? _c : ctx.defaultError;
          if (issue.code === "unrecognized_keys")
            return {
              message: (_d = errorUtil.errToObj(message).message) !== null && _d !== void 0 ? _d : defaultError
            };
          return {
            message: defaultError
          };
        }
      } : {}
    });
  }
  strip() {
    return new _ZodObject({
      ...this._def,
      unknownKeys: "strip"
    });
  }
  passthrough() {
    return new _ZodObject({
      ...this._def,
      unknownKeys: "passthrough"
    });
  }
  // const AugmentFactory =
  //   <Def extends ZodObjectDef>(def: Def) =>
  //   <Augmentation extends ZodRawShape>(
  //     augmentation: Augmentation
  //   ): ZodObject<
  //     extendShape<ReturnType<Def["shape"]>, Augmentation>,
  //     Def["unknownKeys"],
  //     Def["catchall"]
  //   > => {
  //     return new ZodObject({
  //       ...def,
  //       shape: () => ({
  //         ...def.shape(),
  //         ...augmentation,
  //       }),
  //     }) as any;
  //   };
  extend(augmentation) {
    return new _ZodObject({
      ...this._def,
      shape: () => ({
        ...this._def.shape(),
        ...augmentation
      })
    });
  }
  /**
   * Prior to zod@1.0.12 there was a bug in the
   * inferred type of merged objects. Please
   * upgrade if you are experiencing issues.
   */
  merge(merging) {
    const merged = new _ZodObject({
      unknownKeys: merging._def.unknownKeys,
      catchall: merging._def.catchall,
      shape: () => ({
        ...this._def.shape(),
        ...merging._def.shape()
      }),
      typeName: ZodFirstPartyTypeKind.ZodObject
    });
    return merged;
  }
  // merge<
  //   Incoming extends AnyZodObject,
  //   Augmentation extends Incoming["shape"],
  //   NewOutput extends {
  //     [k in keyof Augmentation | keyof Output]: k extends keyof Augmentation
  //       ? Augmentation[k]["_output"]
  //       : k extends keyof Output
  //       ? Output[k]
  //       : never;
  //   },
  //   NewInput extends {
  //     [k in keyof Augmentation | keyof Input]: k extends keyof Augmentation
  //       ? Augmentation[k]["_input"]
  //       : k extends keyof Input
  //       ? Input[k]
  //       : never;
  //   }
  // >(
  //   merging: Incoming
  // ): ZodObject<
  //   extendShape<T, ReturnType<Incoming["_def"]["shape"]>>,
  //   Incoming["_def"]["unknownKeys"],
  //   Incoming["_def"]["catchall"],
  //   NewOutput,
  //   NewInput
  // > {
  //   const merged: any = new ZodObject({
  //     unknownKeys: merging._def.unknownKeys,
  //     catchall: merging._def.catchall,
  //     shape: () =>
  //       objectUtil.mergeShapes(this._def.shape(), merging._def.shape()),
  //     typeName: ZodFirstPartyTypeKind.ZodObject,
  //   }) as any;
  //   return merged;
  // }
  setKey(key, schema) {
    return this.augment({ [key]: schema });
  }
  // merge<Incoming extends AnyZodObject>(
  //   merging: Incoming
  // ): //ZodObject<T & Incoming["_shape"], UnknownKeys, Catchall> = (merging) => {
  // ZodObject<
  //   extendShape<T, ReturnType<Incoming["_def"]["shape"]>>,
  //   Incoming["_def"]["unknownKeys"],
  //   Incoming["_def"]["catchall"]
  // > {
  //   // const mergedShape = objectUtil.mergeShapes(
  //   //   this._def.shape(),
  //   //   merging._def.shape()
  //   // );
  //   const merged: any = new ZodObject({
  //     unknownKeys: merging._def.unknownKeys,
  //     catchall: merging._def.catchall,
  //     shape: () =>
  //       objectUtil.mergeShapes(this._def.shape(), merging._def.shape()),
  //     typeName: ZodFirstPartyTypeKind.ZodObject,
  //   }) as any;
  //   return merged;
  // }
  catchall(index) {
    return new _ZodObject({
      ...this._def,
      catchall: index
    });
  }
  pick(mask) {
    const shape = {};
    util.objectKeys(mask).forEach((key) => {
      if (mask[key] && this.shape[key]) {
        shape[key] = this.shape[key];
      }
    });
    return new _ZodObject({
      ...this._def,
      shape: () => shape
    });
  }
  omit(mask) {
    const shape = {};
    util.objectKeys(this.shape).forEach((key) => {
      if (!mask[key]) {
        shape[key] = this.shape[key];
      }
    });
    return new _ZodObject({
      ...this._def,
      shape: () => shape
    });
  }
  /**
   * @deprecated
   */
  deepPartial() {
    return deepPartialify(this);
  }
  partial(mask) {
    const newShape = {};
    util.objectKeys(this.shape).forEach((key) => {
      const fieldSchema = this.shape[key];
      if (mask && !mask[key]) {
        newShape[key] = fieldSchema;
      } else {
        newShape[key] = fieldSchema.optional();
      }
    });
    return new _ZodObject({
      ...this._def,
      shape: () => newShape
    });
  }
  required(mask) {
    const newShape = {};
    util.objectKeys(this.shape).forEach((key) => {
      if (mask && !mask[key]) {
        newShape[key] = this.shape[key];
      } else {
        const fieldSchema = this.shape[key];
        let newField = fieldSchema;
        while (newField instanceof ZodOptional) {
          newField = newField._def.innerType;
        }
        newShape[key] = newField;
      }
    });
    return new _ZodObject({
      ...this._def,
      shape: () => newShape
    });
  }
  keyof() {
    return createZodEnum(util.objectKeys(this.shape));
  }
};
ZodObject.create = (shape, params) => {
  return new ZodObject({
    shape: () => shape,
    unknownKeys: "strip",
    catchall: ZodNever.create(),
    typeName: ZodFirstPartyTypeKind.ZodObject,
    ...processCreateParams(params)
  });
};
ZodObject.strictCreate = (shape, params) => {
  return new ZodObject({
    shape: () => shape,
    unknownKeys: "strict",
    catchall: ZodNever.create(),
    typeName: ZodFirstPartyTypeKind.ZodObject,
    ...processCreateParams(params)
  });
};
ZodObject.lazycreate = (shape, params) => {
  return new ZodObject({
    shape,
    unknownKeys: "strip",
    catchall: ZodNever.create(),
    typeName: ZodFirstPartyTypeKind.ZodObject,
    ...processCreateParams(params)
  });
};
var ZodUnion = class extends ZodType {
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    const options = this._def.options;
    function handleResults(results) {
      for (const result of results) {
        if (result.result.status === "valid") {
          return result.result;
        }
      }
      for (const result of results) {
        if (result.result.status === "dirty") {
          ctx.common.issues.push(...result.ctx.common.issues);
          return result.result;
        }
      }
      const unionErrors = results.map((result) => new ZodError(result.ctx.common.issues));
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_union,
        unionErrors
      });
      return INVALID;
    }
    if (ctx.common.async) {
      return Promise.all(options.map(async (option) => {
        const childCtx = {
          ...ctx,
          common: {
            ...ctx.common,
            issues: []
          },
          parent: null
        };
        return {
          result: await option._parseAsync({
            data: ctx.data,
            path: ctx.path,
            parent: childCtx
          }),
          ctx: childCtx
        };
      })).then(handleResults);
    } else {
      let dirty = void 0;
      const issues = [];
      for (const option of options) {
        const childCtx = {
          ...ctx,
          common: {
            ...ctx.common,
            issues: []
          },
          parent: null
        };
        const result = option._parseSync({
          data: ctx.data,
          path: ctx.path,
          parent: childCtx
        });
        if (result.status === "valid") {
          return result;
        } else if (result.status === "dirty" && !dirty) {
          dirty = { result, ctx: childCtx };
        }
        if (childCtx.common.issues.length) {
          issues.push(childCtx.common.issues);
        }
      }
      if (dirty) {
        ctx.common.issues.push(...dirty.ctx.common.issues);
        return dirty.result;
      }
      const unionErrors = issues.map((issues2) => new ZodError(issues2));
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_union,
        unionErrors
      });
      return INVALID;
    }
  }
  get options() {
    return this._def.options;
  }
};
ZodUnion.create = (types, params) => {
  return new ZodUnion({
    options: types,
    typeName: ZodFirstPartyTypeKind.ZodUnion,
    ...processCreateParams(params)
  });
};
var getDiscriminator = (type) => {
  if (type instanceof ZodLazy) {
    return getDiscriminator(type.schema);
  } else if (type instanceof ZodEffects) {
    return getDiscriminator(type.innerType());
  } else if (type instanceof ZodLiteral) {
    return [type.value];
  } else if (type instanceof ZodEnum) {
    return type.options;
  } else if (type instanceof ZodNativeEnum) {
    return util.objectValues(type.enum);
  } else if (type instanceof ZodDefault) {
    return getDiscriminator(type._def.innerType);
  } else if (type instanceof ZodUndefined) {
    return [void 0];
  } else if (type instanceof ZodNull) {
    return [null];
  } else if (type instanceof ZodOptional) {
    return [void 0, ...getDiscriminator(type.unwrap())];
  } else if (type instanceof ZodNullable) {
    return [null, ...getDiscriminator(type.unwrap())];
  } else if (type instanceof ZodBranded) {
    return getDiscriminator(type.unwrap());
  } else if (type instanceof ZodReadonly) {
    return getDiscriminator(type.unwrap());
  } else if (type instanceof ZodCatch) {
    return getDiscriminator(type._def.innerType);
  } else {
    return [];
  }
};
var ZodDiscriminatedUnion = class _ZodDiscriminatedUnion extends ZodType {
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    if (ctx.parsedType !== ZodParsedType.object) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.object,
        received: ctx.parsedType
      });
      return INVALID;
    }
    const discriminator = this.discriminator;
    const discriminatorValue = ctx.data[discriminator];
    const option = this.optionsMap.get(discriminatorValue);
    if (!option) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_union_discriminator,
        options: Array.from(this.optionsMap.keys()),
        path: [discriminator]
      });
      return INVALID;
    }
    if (ctx.common.async) {
      return option._parseAsync({
        data: ctx.data,
        path: ctx.path,
        parent: ctx
      });
    } else {
      return option._parseSync({
        data: ctx.data,
        path: ctx.path,
        parent: ctx
      });
    }
  }
  get discriminator() {
    return this._def.discriminator;
  }
  get options() {
    return this._def.options;
  }
  get optionsMap() {
    return this._def.optionsMap;
  }
  /**
   * The constructor of the discriminated union schema. Its behaviour is very similar to that of the normal z.union() constructor.
   * However, it only allows a union of objects, all of which need to share a discriminator property. This property must
   * have a different value for each object in the union.
   * @param discriminator the name of the discriminator property
   * @param types an array of object schemas
   * @param params
   */
  static create(discriminator, options, params) {
    const optionsMap = /* @__PURE__ */ new Map();
    for (const type of options) {
      const discriminatorValues = getDiscriminator(type.shape[discriminator]);
      if (!discriminatorValues.length) {
        throw new Error(`A discriminator value for key \`${discriminator}\` could not be extracted from all schema options`);
      }
      for (const value of discriminatorValues) {
        if (optionsMap.has(value)) {
          throw new Error(`Discriminator property ${String(discriminator)} has duplicate value ${String(value)}`);
        }
        optionsMap.set(value, type);
      }
    }
    return new _ZodDiscriminatedUnion({
      typeName: ZodFirstPartyTypeKind.ZodDiscriminatedUnion,
      discriminator,
      options,
      optionsMap,
      ...processCreateParams(params)
    });
  }
};
function mergeValues(a, b) {
  const aType = getParsedType(a);
  const bType = getParsedType(b);
  if (a === b) {
    return { valid: true, data: a };
  } else if (aType === ZodParsedType.object && bType === ZodParsedType.object) {
    const bKeys = util.objectKeys(b);
    const sharedKeys = util.objectKeys(a).filter((key) => bKeys.indexOf(key) !== -1);
    const newObj = { ...a, ...b };
    for (const key of sharedKeys) {
      const sharedValue = mergeValues(a[key], b[key]);
      if (!sharedValue.valid) {
        return { valid: false };
      }
      newObj[key] = sharedValue.data;
    }
    return { valid: true, data: newObj };
  } else if (aType === ZodParsedType.array && bType === ZodParsedType.array) {
    if (a.length !== b.length) {
      return { valid: false };
    }
    const newArray = [];
    for (let index = 0; index < a.length; index++) {
      const itemA = a[index];
      const itemB = b[index];
      const sharedValue = mergeValues(itemA, itemB);
      if (!sharedValue.valid) {
        return { valid: false };
      }
      newArray.push(sharedValue.data);
    }
    return { valid: true, data: newArray };
  } else if (aType === ZodParsedType.date && bType === ZodParsedType.date && +a === +b) {
    return { valid: true, data: a };
  } else {
    return { valid: false };
  }
}
var ZodIntersection = class extends ZodType {
  _parse(input) {
    const { status, ctx } = this._processInputParams(input);
    const handleParsed = (parsedLeft, parsedRight) => {
      if (isAborted(parsedLeft) || isAborted(parsedRight)) {
        return INVALID;
      }
      const merged = mergeValues(parsedLeft.value, parsedRight.value);
      if (!merged.valid) {
        addIssueToContext(ctx, {
          code: ZodIssueCode.invalid_intersection_types
        });
        return INVALID;
      }
      if (isDirty(parsedLeft) || isDirty(parsedRight)) {
        status.dirty();
      }
      return { status: status.value, value: merged.data };
    };
    if (ctx.common.async) {
      return Promise.all([
        this._def.left._parseAsync({
          data: ctx.data,
          path: ctx.path,
          parent: ctx
        }),
        this._def.right._parseAsync({
          data: ctx.data,
          path: ctx.path,
          parent: ctx
        })
      ]).then(([left, right]) => handleParsed(left, right));
    } else {
      return handleParsed(this._def.left._parseSync({
        data: ctx.data,
        path: ctx.path,
        parent: ctx
      }), this._def.right._parseSync({
        data: ctx.data,
        path: ctx.path,
        parent: ctx
      }));
    }
  }
};
ZodIntersection.create = (left, right, params) => {
  return new ZodIntersection({
    left,
    right,
    typeName: ZodFirstPartyTypeKind.ZodIntersection,
    ...processCreateParams(params)
  });
};
var ZodTuple = class _ZodTuple extends ZodType {
  _parse(input) {
    const { status, ctx } = this._processInputParams(input);
    if (ctx.parsedType !== ZodParsedType.array) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.array,
        received: ctx.parsedType
      });
      return INVALID;
    }
    if (ctx.data.length < this._def.items.length) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.too_small,
        minimum: this._def.items.length,
        inclusive: true,
        exact: false,
        type: "array"
      });
      return INVALID;
    }
    const rest = this._def.rest;
    if (!rest && ctx.data.length > this._def.items.length) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.too_big,
        maximum: this._def.items.length,
        inclusive: true,
        exact: false,
        type: "array"
      });
      status.dirty();
    }
    const items = [...ctx.data].map((item, itemIndex) => {
      const schema = this._def.items[itemIndex] || this._def.rest;
      if (!schema)
        return null;
      return schema._parse(new ParseInputLazyPath(ctx, item, ctx.path, itemIndex));
    }).filter((x) => !!x);
    if (ctx.common.async) {
      return Promise.all(items).then((results) => {
        return ParseStatus.mergeArray(status, results);
      });
    } else {
      return ParseStatus.mergeArray(status, items);
    }
  }
  get items() {
    return this._def.items;
  }
  rest(rest) {
    return new _ZodTuple({
      ...this._def,
      rest
    });
  }
};
ZodTuple.create = (schemas, params) => {
  if (!Array.isArray(schemas)) {
    throw new Error("You must pass an array of schemas to z.tuple([ ... ])");
  }
  return new ZodTuple({
    items: schemas,
    typeName: ZodFirstPartyTypeKind.ZodTuple,
    rest: null,
    ...processCreateParams(params)
  });
};
var ZodRecord = class _ZodRecord extends ZodType {
  get keySchema() {
    return this._def.keyType;
  }
  get valueSchema() {
    return this._def.valueType;
  }
  _parse(input) {
    const { status, ctx } = this._processInputParams(input);
    if (ctx.parsedType !== ZodParsedType.object) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.object,
        received: ctx.parsedType
      });
      return INVALID;
    }
    const pairs = [];
    const keyType = this._def.keyType;
    const valueType = this._def.valueType;
    for (const key in ctx.data) {
      pairs.push({
        key: keyType._parse(new ParseInputLazyPath(ctx, key, ctx.path, key)),
        value: valueType._parse(new ParseInputLazyPath(ctx, ctx.data[key], ctx.path, key)),
        alwaysSet: key in ctx.data
      });
    }
    if (ctx.common.async) {
      return ParseStatus.mergeObjectAsync(status, pairs);
    } else {
      return ParseStatus.mergeObjectSync(status, pairs);
    }
  }
  get element() {
    return this._def.valueType;
  }
  static create(first, second, third) {
    if (second instanceof ZodType) {
      return new _ZodRecord({
        keyType: first,
        valueType: second,
        typeName: ZodFirstPartyTypeKind.ZodRecord,
        ...processCreateParams(third)
      });
    }
    return new _ZodRecord({
      keyType: ZodString.create(),
      valueType: first,
      typeName: ZodFirstPartyTypeKind.ZodRecord,
      ...processCreateParams(second)
    });
  }
};
var ZodMap = class extends ZodType {
  get keySchema() {
    return this._def.keyType;
  }
  get valueSchema() {
    return this._def.valueType;
  }
  _parse(input) {
    const { status, ctx } = this._processInputParams(input);
    if (ctx.parsedType !== ZodParsedType.map) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.map,
        received: ctx.parsedType
      });
      return INVALID;
    }
    const keyType = this._def.keyType;
    const valueType = this._def.valueType;
    const pairs = [...ctx.data.entries()].map(([key, value], index) => {
      return {
        key: keyType._parse(new ParseInputLazyPath(ctx, key, ctx.path, [index, "key"])),
        value: valueType._parse(new ParseInputLazyPath(ctx, value, ctx.path, [index, "value"]))
      };
    });
    if (ctx.common.async) {
      const finalMap = /* @__PURE__ */ new Map();
      return Promise.resolve().then(async () => {
        for (const pair of pairs) {
          const key = await pair.key;
          const value = await pair.value;
          if (key.status === "aborted" || value.status === "aborted") {
            return INVALID;
          }
          if (key.status === "dirty" || value.status === "dirty") {
            status.dirty();
          }
          finalMap.set(key.value, value.value);
        }
        return { status: status.value, value: finalMap };
      });
    } else {
      const finalMap = /* @__PURE__ */ new Map();
      for (const pair of pairs) {
        const key = pair.key;
        const value = pair.value;
        if (key.status === "aborted" || value.status === "aborted") {
          return INVALID;
        }
        if (key.status === "dirty" || value.status === "dirty") {
          status.dirty();
        }
        finalMap.set(key.value, value.value);
      }
      return { status: status.value, value: finalMap };
    }
  }
};
ZodMap.create = (keyType, valueType, params) => {
  return new ZodMap({
    valueType,
    keyType,
    typeName: ZodFirstPartyTypeKind.ZodMap,
    ...processCreateParams(params)
  });
};
var ZodSet = class _ZodSet extends ZodType {
  _parse(input) {
    const { status, ctx } = this._processInputParams(input);
    if (ctx.parsedType !== ZodParsedType.set) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.set,
        received: ctx.parsedType
      });
      return INVALID;
    }
    const def = this._def;
    if (def.minSize !== null) {
      if (ctx.data.size < def.minSize.value) {
        addIssueToContext(ctx, {
          code: ZodIssueCode.too_small,
          minimum: def.minSize.value,
          type: "set",
          inclusive: true,
          exact: false,
          message: def.minSize.message
        });
        status.dirty();
      }
    }
    if (def.maxSize !== null) {
      if (ctx.data.size > def.maxSize.value) {
        addIssueToContext(ctx, {
          code: ZodIssueCode.too_big,
          maximum: def.maxSize.value,
          type: "set",
          inclusive: true,
          exact: false,
          message: def.maxSize.message
        });
        status.dirty();
      }
    }
    const valueType = this._def.valueType;
    function finalizeSet(elements2) {
      const parsedSet = /* @__PURE__ */ new Set();
      for (const element of elements2) {
        if (element.status === "aborted")
          return INVALID;
        if (element.status === "dirty")
          status.dirty();
        parsedSet.add(element.value);
      }
      return { status: status.value, value: parsedSet };
    }
    const elements = [...ctx.data.values()].map((item, i) => valueType._parse(new ParseInputLazyPath(ctx, item, ctx.path, i)));
    if (ctx.common.async) {
      return Promise.all(elements).then((elements2) => finalizeSet(elements2));
    } else {
      return finalizeSet(elements);
    }
  }
  min(minSize, message) {
    return new _ZodSet({
      ...this._def,
      minSize: { value: minSize, message: errorUtil.toString(message) }
    });
  }
  max(maxSize, message) {
    return new _ZodSet({
      ...this._def,
      maxSize: { value: maxSize, message: errorUtil.toString(message) }
    });
  }
  size(size, message) {
    return this.min(size, message).max(size, message);
  }
  nonempty(message) {
    return this.min(1, message);
  }
};
ZodSet.create = (valueType, params) => {
  return new ZodSet({
    valueType,
    minSize: null,
    maxSize: null,
    typeName: ZodFirstPartyTypeKind.ZodSet,
    ...processCreateParams(params)
  });
};
var ZodFunction = class _ZodFunction extends ZodType {
  constructor() {
    super(...arguments);
    this.validate = this.implement;
  }
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    if (ctx.parsedType !== ZodParsedType.function) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.function,
        received: ctx.parsedType
      });
      return INVALID;
    }
    function makeArgsIssue(args, error) {
      return makeIssue({
        data: args,
        path: ctx.path,
        errorMaps: [
          ctx.common.contextualErrorMap,
          ctx.schemaErrorMap,
          getErrorMap(),
          errorMap
        ].filter((x) => !!x),
        issueData: {
          code: ZodIssueCode.invalid_arguments,
          argumentsError: error
        }
      });
    }
    function makeReturnsIssue(returns, error) {
      return makeIssue({
        data: returns,
        path: ctx.path,
        errorMaps: [
          ctx.common.contextualErrorMap,
          ctx.schemaErrorMap,
          getErrorMap(),
          errorMap
        ].filter((x) => !!x),
        issueData: {
          code: ZodIssueCode.invalid_return_type,
          returnTypeError: error
        }
      });
    }
    const params = { errorMap: ctx.common.contextualErrorMap };
    const fn = ctx.data;
    if (this._def.returns instanceof ZodPromise) {
      const me = this;
      return OK(async function(...args) {
        const error = new ZodError([]);
        const parsedArgs = await me._def.args.parseAsync(args, params).catch((e) => {
          error.addIssue(makeArgsIssue(args, e));
          throw error;
        });
        const result = await Reflect.apply(fn, this, parsedArgs);
        const parsedReturns = await me._def.returns._def.type.parseAsync(result, params).catch((e) => {
          error.addIssue(makeReturnsIssue(result, e));
          throw error;
        });
        return parsedReturns;
      });
    } else {
      const me = this;
      return OK(function(...args) {
        const parsedArgs = me._def.args.safeParse(args, params);
        if (!parsedArgs.success) {
          throw new ZodError([makeArgsIssue(args, parsedArgs.error)]);
        }
        const result = Reflect.apply(fn, this, parsedArgs.data);
        const parsedReturns = me._def.returns.safeParse(result, params);
        if (!parsedReturns.success) {
          throw new ZodError([makeReturnsIssue(result, parsedReturns.error)]);
        }
        return parsedReturns.data;
      });
    }
  }
  parameters() {
    return this._def.args;
  }
  returnType() {
    return this._def.returns;
  }
  args(...items) {
    return new _ZodFunction({
      ...this._def,
      args: ZodTuple.create(items).rest(ZodUnknown.create())
    });
  }
  returns(returnType) {
    return new _ZodFunction({
      ...this._def,
      returns: returnType
    });
  }
  implement(func) {
    const validatedFunc = this.parse(func);
    return validatedFunc;
  }
  strictImplement(func) {
    const validatedFunc = this.parse(func);
    return validatedFunc;
  }
  static create(args, returns, params) {
    return new _ZodFunction({
      args: args ? args : ZodTuple.create([]).rest(ZodUnknown.create()),
      returns: returns || ZodUnknown.create(),
      typeName: ZodFirstPartyTypeKind.ZodFunction,
      ...processCreateParams(params)
    });
  }
};
var ZodLazy = class extends ZodType {
  get schema() {
    return this._def.getter();
  }
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    const lazySchema = this._def.getter();
    return lazySchema._parse({ data: ctx.data, path: ctx.path, parent: ctx });
  }
};
ZodLazy.create = (getter, params) => {
  return new ZodLazy({
    getter,
    typeName: ZodFirstPartyTypeKind.ZodLazy,
    ...processCreateParams(params)
  });
};
var ZodLiteral = class extends ZodType {
  _parse(input) {
    if (input.data !== this._def.value) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext(ctx, {
        received: ctx.data,
        code: ZodIssueCode.invalid_literal,
        expected: this._def.value
      });
      return INVALID;
    }
    return { status: "valid", value: input.data };
  }
  get value() {
    return this._def.value;
  }
};
ZodLiteral.create = (value, params) => {
  return new ZodLiteral({
    value,
    typeName: ZodFirstPartyTypeKind.ZodLiteral,
    ...processCreateParams(params)
  });
};
function createZodEnum(values, params) {
  return new ZodEnum({
    values,
    typeName: ZodFirstPartyTypeKind.ZodEnum,
    ...processCreateParams(params)
  });
}
var ZodEnum = class _ZodEnum extends ZodType {
  constructor() {
    super(...arguments);
    _ZodEnum_cache.set(this, void 0);
  }
  _parse(input) {
    if (typeof input.data !== "string") {
      const ctx = this._getOrReturnCtx(input);
      const expectedValues = this._def.values;
      addIssueToContext(ctx, {
        expected: util.joinValues(expectedValues),
        received: ctx.parsedType,
        code: ZodIssueCode.invalid_type
      });
      return INVALID;
    }
    if (!__classPrivateFieldGet(this, _ZodEnum_cache, "f")) {
      __classPrivateFieldSet(this, _ZodEnum_cache, new Set(this._def.values), "f");
    }
    if (!__classPrivateFieldGet(this, _ZodEnum_cache, "f").has(input.data)) {
      const ctx = this._getOrReturnCtx(input);
      const expectedValues = this._def.values;
      addIssueToContext(ctx, {
        received: ctx.data,
        code: ZodIssueCode.invalid_enum_value,
        options: expectedValues
      });
      return INVALID;
    }
    return OK(input.data);
  }
  get options() {
    return this._def.values;
  }
  get enum() {
    const enumValues = {};
    for (const val of this._def.values) {
      enumValues[val] = val;
    }
    return enumValues;
  }
  get Values() {
    const enumValues = {};
    for (const val of this._def.values) {
      enumValues[val] = val;
    }
    return enumValues;
  }
  get Enum() {
    const enumValues = {};
    for (const val of this._def.values) {
      enumValues[val] = val;
    }
    return enumValues;
  }
  extract(values, newDef = this._def) {
    return _ZodEnum.create(values, {
      ...this._def,
      ...newDef
    });
  }
  exclude(values, newDef = this._def) {
    return _ZodEnum.create(this.options.filter((opt) => !values.includes(opt)), {
      ...this._def,
      ...newDef
    });
  }
};
_ZodEnum_cache = /* @__PURE__ */ new WeakMap();
ZodEnum.create = createZodEnum;
var ZodNativeEnum = class extends ZodType {
  constructor() {
    super(...arguments);
    _ZodNativeEnum_cache.set(this, void 0);
  }
  _parse(input) {
    const nativeEnumValues = util.getValidEnumValues(this._def.values);
    const ctx = this._getOrReturnCtx(input);
    if (ctx.parsedType !== ZodParsedType.string && ctx.parsedType !== ZodParsedType.number) {
      const expectedValues = util.objectValues(nativeEnumValues);
      addIssueToContext(ctx, {
        expected: util.joinValues(expectedValues),
        received: ctx.parsedType,
        code: ZodIssueCode.invalid_type
      });
      return INVALID;
    }
    if (!__classPrivateFieldGet(this, _ZodNativeEnum_cache, "f")) {
      __classPrivateFieldSet(this, _ZodNativeEnum_cache, new Set(util.getValidEnumValues(this._def.values)), "f");
    }
    if (!__classPrivateFieldGet(this, _ZodNativeEnum_cache, "f").has(input.data)) {
      const expectedValues = util.objectValues(nativeEnumValues);
      addIssueToContext(ctx, {
        received: ctx.data,
        code: ZodIssueCode.invalid_enum_value,
        options: expectedValues
      });
      return INVALID;
    }
    return OK(input.data);
  }
  get enum() {
    return this._def.values;
  }
};
_ZodNativeEnum_cache = /* @__PURE__ */ new WeakMap();
ZodNativeEnum.create = (values, params) => {
  return new ZodNativeEnum({
    values,
    typeName: ZodFirstPartyTypeKind.ZodNativeEnum,
    ...processCreateParams(params)
  });
};
var ZodPromise = class extends ZodType {
  unwrap() {
    return this._def.type;
  }
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    if (ctx.parsedType !== ZodParsedType.promise && ctx.common.async === false) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.promise,
        received: ctx.parsedType
      });
      return INVALID;
    }
    const promisified = ctx.parsedType === ZodParsedType.promise ? ctx.data : Promise.resolve(ctx.data);
    return OK(promisified.then((data) => {
      return this._def.type.parseAsync(data, {
        path: ctx.path,
        errorMap: ctx.common.contextualErrorMap
      });
    }));
  }
};
ZodPromise.create = (schema, params) => {
  return new ZodPromise({
    type: schema,
    typeName: ZodFirstPartyTypeKind.ZodPromise,
    ...processCreateParams(params)
  });
};
var ZodEffects = class extends ZodType {
  innerType() {
    return this._def.schema;
  }
  sourceType() {
    return this._def.schema._def.typeName === ZodFirstPartyTypeKind.ZodEffects ? this._def.schema.sourceType() : this._def.schema;
  }
  _parse(input) {
    const { status, ctx } = this._processInputParams(input);
    const effect = this._def.effect || null;
    const checkCtx = {
      addIssue: (arg) => {
        addIssueToContext(ctx, arg);
        if (arg.fatal) {
          status.abort();
        } else {
          status.dirty();
        }
      },
      get path() {
        return ctx.path;
      }
    };
    checkCtx.addIssue = checkCtx.addIssue.bind(checkCtx);
    if (effect.type === "preprocess") {
      const processed = effect.transform(ctx.data, checkCtx);
      if (ctx.common.async) {
        return Promise.resolve(processed).then(async (processed2) => {
          if (status.value === "aborted")
            return INVALID;
          const result = await this._def.schema._parseAsync({
            data: processed2,
            path: ctx.path,
            parent: ctx
          });
          if (result.status === "aborted")
            return INVALID;
          if (result.status === "dirty")
            return DIRTY(result.value);
          if (status.value === "dirty")
            return DIRTY(result.value);
          return result;
        });
      } else {
        if (status.value === "aborted")
          return INVALID;
        const result = this._def.schema._parseSync({
          data: processed,
          path: ctx.path,
          parent: ctx
        });
        if (result.status === "aborted")
          return INVALID;
        if (result.status === "dirty")
          return DIRTY(result.value);
        if (status.value === "dirty")
          return DIRTY(result.value);
        return result;
      }
    }
    if (effect.type === "refinement") {
      const executeRefinement = (acc) => {
        const result = effect.refinement(acc, checkCtx);
        if (ctx.common.async) {
          return Promise.resolve(result);
        }
        if (result instanceof Promise) {
          throw new Error("Async refinement encountered during synchronous parse operation. Use .parseAsync instead.");
        }
        return acc;
      };
      if (ctx.common.async === false) {
        const inner = this._def.schema._parseSync({
          data: ctx.data,
          path: ctx.path,
          parent: ctx
        });
        if (inner.status === "aborted")
          return INVALID;
        if (inner.status === "dirty")
          status.dirty();
        executeRefinement(inner.value);
        return { status: status.value, value: inner.value };
      } else {
        return this._def.schema._parseAsync({ data: ctx.data, path: ctx.path, parent: ctx }).then((inner) => {
          if (inner.status === "aborted")
            return INVALID;
          if (inner.status === "dirty")
            status.dirty();
          return executeRefinement(inner.value).then(() => {
            return { status: status.value, value: inner.value };
          });
        });
      }
    }
    if (effect.type === "transform") {
      if (ctx.common.async === false) {
        const base = this._def.schema._parseSync({
          data: ctx.data,
          path: ctx.path,
          parent: ctx
        });
        if (!isValid(base))
          return base;
        const result = effect.transform(base.value, checkCtx);
        if (result instanceof Promise) {
          throw new Error(`Asynchronous transform encountered during synchronous parse operation. Use .parseAsync instead.`);
        }
        return { status: status.value, value: result };
      } else {
        return this._def.schema._parseAsync({ data: ctx.data, path: ctx.path, parent: ctx }).then((base) => {
          if (!isValid(base))
            return base;
          return Promise.resolve(effect.transform(base.value, checkCtx)).then((result) => ({ status: status.value, value: result }));
        });
      }
    }
    util.assertNever(effect);
  }
};
ZodEffects.create = (schema, effect, params) => {
  return new ZodEffects({
    schema,
    typeName: ZodFirstPartyTypeKind.ZodEffects,
    effect,
    ...processCreateParams(params)
  });
};
ZodEffects.createWithPreprocess = (preprocess, schema, params) => {
  return new ZodEffects({
    schema,
    effect: { type: "preprocess", transform: preprocess },
    typeName: ZodFirstPartyTypeKind.ZodEffects,
    ...processCreateParams(params)
  });
};
var ZodOptional = class extends ZodType {
  _parse(input) {
    const parsedType = this._getType(input);
    if (parsedType === ZodParsedType.undefined) {
      return OK(void 0);
    }
    return this._def.innerType._parse(input);
  }
  unwrap() {
    return this._def.innerType;
  }
};
ZodOptional.create = (type, params) => {
  return new ZodOptional({
    innerType: type,
    typeName: ZodFirstPartyTypeKind.ZodOptional,
    ...processCreateParams(params)
  });
};
var ZodNullable = class extends ZodType {
  _parse(input) {
    const parsedType = this._getType(input);
    if (parsedType === ZodParsedType.null) {
      return OK(null);
    }
    return this._def.innerType._parse(input);
  }
  unwrap() {
    return this._def.innerType;
  }
};
ZodNullable.create = (type, params) => {
  return new ZodNullable({
    innerType: type,
    typeName: ZodFirstPartyTypeKind.ZodNullable,
    ...processCreateParams(params)
  });
};
var ZodDefault = class extends ZodType {
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    let data = ctx.data;
    if (ctx.parsedType === ZodParsedType.undefined) {
      data = this._def.defaultValue();
    }
    return this._def.innerType._parse({
      data,
      path: ctx.path,
      parent: ctx
    });
  }
  removeDefault() {
    return this._def.innerType;
  }
};
ZodDefault.create = (type, params) => {
  return new ZodDefault({
    innerType: type,
    typeName: ZodFirstPartyTypeKind.ZodDefault,
    defaultValue: typeof params.default === "function" ? params.default : () => params.default,
    ...processCreateParams(params)
  });
};
var ZodCatch = class extends ZodType {
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    const newCtx = {
      ...ctx,
      common: {
        ...ctx.common,
        issues: []
      }
    };
    const result = this._def.innerType._parse({
      data: newCtx.data,
      path: newCtx.path,
      parent: {
        ...newCtx
      }
    });
    if (isAsync(result)) {
      return result.then((result2) => {
        return {
          status: "valid",
          value: result2.status === "valid" ? result2.value : this._def.catchValue({
            get error() {
              return new ZodError(newCtx.common.issues);
            },
            input: newCtx.data
          })
        };
      });
    } else {
      return {
        status: "valid",
        value: result.status === "valid" ? result.value : this._def.catchValue({
          get error() {
            return new ZodError(newCtx.common.issues);
          },
          input: newCtx.data
        })
      };
    }
  }
  removeCatch() {
    return this._def.innerType;
  }
};
ZodCatch.create = (type, params) => {
  return new ZodCatch({
    innerType: type,
    typeName: ZodFirstPartyTypeKind.ZodCatch,
    catchValue: typeof params.catch === "function" ? params.catch : () => params.catch,
    ...processCreateParams(params)
  });
};
var ZodNaN = class extends ZodType {
  _parse(input) {
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.nan) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.nan,
        received: ctx.parsedType
      });
      return INVALID;
    }
    return { status: "valid", value: input.data };
  }
};
ZodNaN.create = (params) => {
  return new ZodNaN({
    typeName: ZodFirstPartyTypeKind.ZodNaN,
    ...processCreateParams(params)
  });
};
var BRAND = Symbol("zod_brand");
var ZodBranded = class extends ZodType {
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    const data = ctx.data;
    return this._def.type._parse({
      data,
      path: ctx.path,
      parent: ctx
    });
  }
  unwrap() {
    return this._def.type;
  }
};
var ZodPipeline = class _ZodPipeline extends ZodType {
  _parse(input) {
    const { status, ctx } = this._processInputParams(input);
    if (ctx.common.async) {
      const handleAsync = async () => {
        const inResult = await this._def.in._parseAsync({
          data: ctx.data,
          path: ctx.path,
          parent: ctx
        });
        if (inResult.status === "aborted")
          return INVALID;
        if (inResult.status === "dirty") {
          status.dirty();
          return DIRTY(inResult.value);
        } else {
          return this._def.out._parseAsync({
            data: inResult.value,
            path: ctx.path,
            parent: ctx
          });
        }
      };
      return handleAsync();
    } else {
      const inResult = this._def.in._parseSync({
        data: ctx.data,
        path: ctx.path,
        parent: ctx
      });
      if (inResult.status === "aborted")
        return INVALID;
      if (inResult.status === "dirty") {
        status.dirty();
        return {
          status: "dirty",
          value: inResult.value
        };
      } else {
        return this._def.out._parseSync({
          data: inResult.value,
          path: ctx.path,
          parent: ctx
        });
      }
    }
  }
  static create(a, b) {
    return new _ZodPipeline({
      in: a,
      out: b,
      typeName: ZodFirstPartyTypeKind.ZodPipeline
    });
  }
};
var ZodReadonly = class extends ZodType {
  _parse(input) {
    const result = this._def.innerType._parse(input);
    const freeze = (data) => {
      if (isValid(data)) {
        data.value = Object.freeze(data.value);
      }
      return data;
    };
    return isAsync(result) ? result.then((data) => freeze(data)) : freeze(result);
  }
  unwrap() {
    return this._def.innerType;
  }
};
ZodReadonly.create = (type, params) => {
  return new ZodReadonly({
    innerType: type,
    typeName: ZodFirstPartyTypeKind.ZodReadonly,
    ...processCreateParams(params)
  });
};
function custom(check, params = {}, fatal) {
  if (check)
    return ZodAny.create().superRefine((data, ctx) => {
      var _a, _b;
      if (!check(data)) {
        const p = typeof params === "function" ? params(data) : typeof params === "string" ? { message: params } : params;
        const _fatal = (_b = (_a = p.fatal) !== null && _a !== void 0 ? _a : fatal) !== null && _b !== void 0 ? _b : true;
        const p2 = typeof p === "string" ? { message: p } : p;
        ctx.addIssue({ code: "custom", ...p2, fatal: _fatal });
      }
    });
  return ZodAny.create();
}
var late = {
  object: ZodObject.lazycreate
};
var ZodFirstPartyTypeKind;
(function(ZodFirstPartyTypeKind2) {
  ZodFirstPartyTypeKind2["ZodString"] = "ZodString";
  ZodFirstPartyTypeKind2["ZodNumber"] = "ZodNumber";
  ZodFirstPartyTypeKind2["ZodNaN"] = "ZodNaN";
  ZodFirstPartyTypeKind2["ZodBigInt"] = "ZodBigInt";
  ZodFirstPartyTypeKind2["ZodBoolean"] = "ZodBoolean";
  ZodFirstPartyTypeKind2["ZodDate"] = "ZodDate";
  ZodFirstPartyTypeKind2["ZodSymbol"] = "ZodSymbol";
  ZodFirstPartyTypeKind2["ZodUndefined"] = "ZodUndefined";
  ZodFirstPartyTypeKind2["ZodNull"] = "ZodNull";
  ZodFirstPartyTypeKind2["ZodAny"] = "ZodAny";
  ZodFirstPartyTypeKind2["ZodUnknown"] = "ZodUnknown";
  ZodFirstPartyTypeKind2["ZodNever"] = "ZodNever";
  ZodFirstPartyTypeKind2["ZodVoid"] = "ZodVoid";
  ZodFirstPartyTypeKind2["ZodArray"] = "ZodArray";
  ZodFirstPartyTypeKind2["ZodObject"] = "ZodObject";
  ZodFirstPartyTypeKind2["ZodUnion"] = "ZodUnion";
  ZodFirstPartyTypeKind2["ZodDiscriminatedUnion"] = "ZodDiscriminatedUnion";
  ZodFirstPartyTypeKind2["ZodIntersection"] = "ZodIntersection";
  ZodFirstPartyTypeKind2["ZodTuple"] = "ZodTuple";
  ZodFirstPartyTypeKind2["ZodRecord"] = "ZodRecord";
  ZodFirstPartyTypeKind2["ZodMap"] = "ZodMap";
  ZodFirstPartyTypeKind2["ZodSet"] = "ZodSet";
  ZodFirstPartyTypeKind2["ZodFunction"] = "ZodFunction";
  ZodFirstPartyTypeKind2["ZodLazy"] = "ZodLazy";
  ZodFirstPartyTypeKind2["ZodLiteral"] = "ZodLiteral";
  ZodFirstPartyTypeKind2["ZodEnum"] = "ZodEnum";
  ZodFirstPartyTypeKind2["ZodEffects"] = "ZodEffects";
  ZodFirstPartyTypeKind2["ZodNativeEnum"] = "ZodNativeEnum";
  ZodFirstPartyTypeKind2["ZodOptional"] = "ZodOptional";
  ZodFirstPartyTypeKind2["ZodNullable"] = "ZodNullable";
  ZodFirstPartyTypeKind2["ZodDefault"] = "ZodDefault";
  ZodFirstPartyTypeKind2["ZodCatch"] = "ZodCatch";
  ZodFirstPartyTypeKind2["ZodPromise"] = "ZodPromise";
  ZodFirstPartyTypeKind2["ZodBranded"] = "ZodBranded";
  ZodFirstPartyTypeKind2["ZodPipeline"] = "ZodPipeline";
  ZodFirstPartyTypeKind2["ZodReadonly"] = "ZodReadonly";
})(ZodFirstPartyTypeKind || (ZodFirstPartyTypeKind = {}));
var instanceOfType = (cls, params = {
  message: `Input not instance of ${cls.name}`
}) => custom((data) => data instanceof cls, params);
var stringType = ZodString.create;
var numberType = ZodNumber.create;
var nanType = ZodNaN.create;
var bigIntType = ZodBigInt.create;
var booleanType = ZodBoolean.create;
var dateType = ZodDate.create;
var symbolType = ZodSymbol.create;
var undefinedType = ZodUndefined.create;
var nullType = ZodNull.create;
var anyType = ZodAny.create;
var unknownType = ZodUnknown.create;
var neverType = ZodNever.create;
var voidType = ZodVoid.create;
var arrayType = ZodArray.create;
var objectType = ZodObject.create;
var strictObjectType = ZodObject.strictCreate;
var unionType = ZodUnion.create;
var discriminatedUnionType = ZodDiscriminatedUnion.create;
var intersectionType = ZodIntersection.create;
var tupleType = ZodTuple.create;
var recordType = ZodRecord.create;
var mapType = ZodMap.create;
var setType = ZodSet.create;
var functionType = ZodFunction.create;
var lazyType = ZodLazy.create;
var literalType = ZodLiteral.create;
var enumType = ZodEnum.create;
var nativeEnumType = ZodNativeEnum.create;
var promiseType = ZodPromise.create;
var effectsType = ZodEffects.create;
var optionalType = ZodOptional.create;
var nullableType = ZodNullable.create;
var preprocessType = ZodEffects.createWithPreprocess;
var pipelineType = ZodPipeline.create;
var ostring = () => stringType().optional();
var onumber = () => numberType().optional();
var oboolean = () => booleanType().optional();
var coerce = {
  string: (arg) => ZodString.create({ ...arg, coerce: true }),
  number: (arg) => ZodNumber.create({ ...arg, coerce: true }),
  boolean: (arg) => ZodBoolean.create({
    ...arg,
    coerce: true
  }),
  bigint: (arg) => ZodBigInt.create({ ...arg, coerce: true }),
  date: (arg) => ZodDate.create({ ...arg, coerce: true })
};
var NEVER = INVALID;
var z = /* @__PURE__ */ Object.freeze({
  __proto__: null,
  defaultErrorMap: errorMap,
  setErrorMap,
  getErrorMap,
  makeIssue,
  EMPTY_PATH,
  addIssueToContext,
  ParseStatus,
  INVALID,
  DIRTY,
  OK,
  isAborted,
  isDirty,
  isValid,
  isAsync,
  get util() {
    return util;
  },
  get objectUtil() {
    return objectUtil;
  },
  ZodParsedType,
  getParsedType,
  ZodType,
  datetimeRegex,
  ZodString,
  ZodNumber,
  ZodBigInt,
  ZodBoolean,
  ZodDate,
  ZodSymbol,
  ZodUndefined,
  ZodNull,
  ZodAny,
  ZodUnknown,
  ZodNever,
  ZodVoid,
  ZodArray,
  ZodObject,
  ZodUnion,
  ZodDiscriminatedUnion,
  ZodIntersection,
  ZodTuple,
  ZodRecord,
  ZodMap,
  ZodSet,
  ZodFunction,
  ZodLazy,
  ZodLiteral,
  ZodEnum,
  ZodNativeEnum,
  ZodPromise,
  ZodEffects,
  ZodTransformer: ZodEffects,
  ZodOptional,
  ZodNullable,
  ZodDefault,
  ZodCatch,
  ZodNaN,
  BRAND,
  ZodBranded,
  ZodPipeline,
  ZodReadonly,
  custom,
  Schema: ZodType,
  ZodSchema: ZodType,
  late,
  get ZodFirstPartyTypeKind() {
    return ZodFirstPartyTypeKind;
  },
  coerce,
  any: anyType,
  array: arrayType,
  bigint: bigIntType,
  boolean: booleanType,
  date: dateType,
  discriminatedUnion: discriminatedUnionType,
  effect: effectsType,
  "enum": enumType,
  "function": functionType,
  "instanceof": instanceOfType,
  intersection: intersectionType,
  lazy: lazyType,
  literal: literalType,
  map: mapType,
  nan: nanType,
  nativeEnum: nativeEnumType,
  never: neverType,
  "null": nullType,
  nullable: nullableType,
  number: numberType,
  object: objectType,
  oboolean,
  onumber,
  optional: optionalType,
  ostring,
  pipeline: pipelineType,
  preprocess: preprocessType,
  promise: promiseType,
  record: recordType,
  set: setType,
  strictObject: strictObjectType,
  string: stringType,
  symbol: symbolType,
  transformer: effectsType,
  tuple: tupleType,
  "undefined": undefinedType,
  union: unionType,
  unknown: unknownType,
  "void": voidType,
  NEVER,
  ZodIssueCode,
  quotelessJson,
  ZodError
});

// src/providers/wallet.ts
import { TonClient, WalletContractV4 } from "@ton/ton";
import {
  mnemonicToWalletKey,
  mnemonicNew
} from "@ton/crypto";
import NodeCache from "node-cache";
import * as path from "node:path";
import BigNumber from "bignumber.js";

// src/enviroment.ts
var CONFIG_KEYS = {
  TON_PRIVATE_KEY: "TON_PRIVATE_KEY",
  TON_RPC_URL: "TON_RPC_URL",
  TON_RPC_API_KEY: "TON_RPC_API_KEY",
  TON_EXPLORER_URL: "TON_EXPLORER_URL",
  TON_MANIFEST_URL: "TON_MANIFEST_URL",
  TON_BRIDGE_URL: "TON_BRIDGE_URL"
};
var envSchema = z.object({
  TON_PRIVATE_KEY: z.string().min(1, "Ton private key is required"),
  TON_RPC_URL: z.string(),
  TON_RPC_API_KEY: z.string(),
  TON_EXPLORER_URL: z.string(),
  TON_MANIFEST_URL: z.string(),
  TON_BRIDGE_URL: z.string()
});

// src/providers/wallet.ts
import crypto2 from "node:crypto";
import fs from "node:fs";
var PROVIDER_CONFIG = {
  MAINNET_RPC: process.env.TON_RPC_URL ?? "https://toncenter.com/api/v2/jsonRPC",
  RPC_API_KEY: process.env.TON_RPC_API_KEY ?? "",
  STONFI_TON_USD_POOL: "EQCGScrZe1xbyWqWDvdI6mzP-GAcAWFv6ZXuaJOuSqemxku4",
  CHAIN_NAME_IN_DEXSCREENER: "ton",
  // USD_DECIMAL=10^6
  MAX_RETRIES: 3,
  RETRY_DELAY: 2e3,
  // 10^9
  TON_DECIMAL: BigInt(1e9)
};
function encrypt(text, password) {
  const iv = crypto2.randomBytes(16);
  const key = crypto2.scryptSync(password, "salt", 32);
  const cipher = crypto2.createCipheriv("aes-256-cbc", key, iv);
  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");
  return iv.toString("hex") + ":" + encrypted;
}
function decrypt(encrypted, password) {
  const [ivHex, encryptedText] = encrypted.split(":");
  const iv = Buffer.from(ivHex, "hex");
  const key = crypto2.scryptSync(password, "salt", 32);
  const decipher = crypto2.createDecipheriv("aes-256-cbc", key, iv);
  let decrypted = decipher.update(encryptedText, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}
var WalletProvider = class _WalletProvider {
  constructor(keypair, endpoint, cacheManager) {
    this.endpoint = endpoint;
    this.cacheManager = cacheManager;
    this.keypair = keypair;
    this.cache = new NodeCache({ stdTTL: 300 });
    this.wallet = WalletContractV4.create({
      workchain: 0,
      publicKey: keypair.publicKey
    });
    this.rpcApiKey = process.env.TON_RPC_API_KEY || PROVIDER_CONFIG.RPC_API_KEY;
  }
  keypair;
  wallet;
  cache;
  cacheKey = "ton/wallet";
  rpcApiKey;
  // thanks to plugin-sui
  async readFromCache(key) {
    const cached = await this.cacheManager.get(
      path.join(this.cacheKey, key)
    );
    return cached;
  }
  async writeToCache(key, data) {
    await this.cacheManager.set(path.join(this.cacheKey, key), data, {
      expires: Date.now() + 5 * 60 * 1e3
    });
  }
  async getCachedData(key) {
    const cachedData = this.cache.get(key);
    if (cachedData) {
      return cachedData;
    }
    const fileCachedData = await this.readFromCache(key);
    if (fileCachedData) {
      this.cache.set(key, fileCachedData);
      return fileCachedData;
    }
    return null;
  }
  async setCachedData(cacheKey, data) {
    this.cache.set(cacheKey, data);
    await this.writeToCache(cacheKey, data);
  }
  async fetchPricesWithRetry() {
    let lastError;
    for (let i = 0; i < PROVIDER_CONFIG.MAX_RETRIES; i++) {
      try {
        const response = await fetch(
          `https://api.dexscreener.com/latest/dex/pairs/${PROVIDER_CONFIG.CHAIN_NAME_IN_DEXSCREENER}/${PROVIDER_CONFIG.STONFI_TON_USD_POOL}`
        );
        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(
            `HTTP error! status: ${response.status}, message: ${errorText}`
          );
        }
        const data = await response.json();
        return data;
      } catch (error) {
        console.error(`Attempt ${i + 1} failed:`, error);
        lastError = error;
        if (i < PROVIDER_CONFIG.MAX_RETRIES - 1) {
          const delay = PROVIDER_CONFIG.RETRY_DELAY * 2 ** i;
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }
    console.error(
      "All attempts failed. Throwing the last error:",
      lastError
    );
    throw lastError;
  }
  async fetchPrices() {
    try {
      const cacheKey = "prices";
      const cachedValue = await this.getCachedData(cacheKey);
      if (cachedValue) {
        console.log("Cache hit for fetchPrices");
        return cachedValue;
      }
      console.log("Cache miss for fetchPrices");
      const priceData = await this.fetchPricesWithRetry().catch(
        (error) => {
          console.error(
            `Error fetching ${PROVIDER_CONFIG.CHAIN_NAME_IN_DEXSCREENER.toUpperCase()} price:`,
            error
          );
          throw error;
        }
      );
      const prices = {
        nativeToken: { usd: new BigNumber(priceData.pair.priceUsd).dividedBy(new BigNumber(priceData.pair.priceNative)) }
      };
      this.setCachedData(cacheKey, prices);
      return prices;
    } catch (error) {
      console.error("Error fetching prices:", error);
      throw error;
    }
  }
  formatPortfolio(runtime, portfolio) {
    let output = `${runtime.character.name}
`;
    output += `Wallet Address: ${this.getAddress()}
`;
    const totalUsdFormatted = new BigNumber(portfolio.totalUsd).toFixed(2);
    const totalNativeTokenFormatted = new BigNumber(
      portfolio.totalNativeToken
    ).toFixed(4);
    output += `Total Value: $${totalUsdFormatted} (${totalNativeTokenFormatted} ${PROVIDER_CONFIG.CHAIN_NAME_IN_DEXSCREENER.toUpperCase()})
`;
    return output;
  }
  async fetchPortfolioValue() {
    try {
      const cacheKey = `portfolio-${this.getAddress()}`;
      const cachedValue = await this.getCachedData(cacheKey);
      if (cachedValue) {
        console.log("Cache hit for fetchPortfolioValue", cachedValue);
        return cachedValue;
      }
      console.log("Cache miss for fetchPortfolioValue");
      const prices = await this.fetchPrices().catch((error) => {
        console.error(
          `Error fetching ${PROVIDER_CONFIG.CHAIN_NAME_IN_DEXSCREENER.toUpperCase()} price:`,
          error
        );
        throw error;
      });
      const nativeTokenBalance = await this.getWalletBalance().catch(
        (error) => {
          console.error(
            `Error fetching ${PROVIDER_CONFIG.CHAIN_NAME_IN_DEXSCREENER.toUpperCase()} amount:`,
            error
          );
          throw error;
        }
      );
      const amount = Number(nativeTokenBalance) / Number(PROVIDER_CONFIG.TON_DECIMAL);
      const totalUsd = new BigNumber(amount.toString()).times(
        prices.nativeToken.usd
      );
      const portfolio = {
        totalUsd: totalUsd.toString(),
        totalNativeToken: amount.toFixed(4).toString()
      };
      this.setCachedData(cacheKey, portfolio);
      return portfolio;
    } catch (error) {
      console.error("Error fetching portfolio:", error);
      throw error;
    }
  }
  async getFormattedPortfolio(runtime) {
    try {
      const portfolio = await this.fetchPortfolioValue();
      return this.formatPortfolio(runtime, portfolio);
    } catch (error) {
      console.error("Error generating portfolio report:", error);
      return "Unable to fetch wallet information. Please try again later.";
    }
  }
  getAddress() {
    const formattedAddress = this.wallet.address.toString({
      bounceable: false,
      urlSafe: true
    });
    return formattedAddress;
  }
  getWalletClient() {
    const client = new TonClient({
      endpoint: this.endpoint,
      apiKey: this.rpcApiKey
    });
    return client;
  }
  async getWalletBalance() {
    try {
      const client = this.getWalletClient();
      const balance = await client.getBalance(this.wallet.address);
      return balance;
    } catch (error) {
      console.error("Error getting wallet balance:", error);
      return null;
    }
  }
  /**
   * Generates a new wallet on demand.
   * Returns the WalletProvider instance along with the mnemonic (for backup).
   * The mnemonic should be stored securely by the AI agent.
   * Additionally, the wallet's keypair is exported as an encrypted backup
   * using the provided password, and stored in a file.
   */
  static async generateNew(rpcUrl, password, cacheManager) {
    const mnemonic = await mnemonicNew(24, password);
    const keypair = await mnemonicToWalletKey(mnemonic, password);
    const walletProvider = new _WalletProvider(keypair, rpcUrl, cacheManager);
    const encryptedKeyBackup = await walletProvider.exportWallet(password);
    const backupDir = path.join(process.cwd(), "ton_wallet_backups");
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }
    const fileName = `${walletProvider.getAddress()}_wallet_backup.json`;
    const filePath = path.join(backupDir, fileName);
    fs.writeFileSync(filePath, encryptedKeyBackup, { encoding: "utf-8" });
    console.log(`Wallet backup saved to ${filePath}`);
    return { walletProvider, mnemonic };
  }
  /**
   * Imports a wallet from an encrypted backup file.
   * Reads the backup file content, decrypts it using the provided password, and returns a WalletProvider instance.
   */
  static async importWalletFromFile(runtime, walletAddress, password) {
    const backupDir = path.join(process.cwd(), "ton_wallet_backups");
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }
    const fileName = `${walletAddress}_wallet_backup.json`;
    const filePath = path.join(backupDir, fileName);
    if (!fs.existsSync(filePath)) {
      throw new Error(`Wallet backup file does not exist at: ${filePath}`);
    }
    const encryptedData = fs.readFileSync(filePath, { encoding: "utf-8" });
    const walletProvider = await _WalletProvider.importWallet(encryptedData, password, runtime);
    return walletProvider;
  }
  /**
   * Exports the wallet's keypair as an encrypted JSON string.
   */
  async exportWallet(password) {
    const keyData = JSON.stringify({
      publicKey: Buffer.from(this.keypair.publicKey).toString("hex"),
      secretKey: Buffer.from(this.keypair.secretKey).toString("hex")
    });
    return encrypt(keyData, password);
  }
  /**
   * Imports a wallet from its encrypted backup.
   */
  static async importWallet(encryptedData, password, runtime) {
    const decrypted = decrypt(encryptedData, password);
    const keyData = JSON.parse(decrypted);
    const keypair = {
      publicKey: Buffer.from(keyData.publicKey, "hex"),
      secretKey: Buffer.from(keyData.secretKey, "hex")
    };
    const rpcUrl = runtime.getSetting("TON_RPC_URL") || PROVIDER_CONFIG.MAINNET_RPC;
    return new _WalletProvider(keypair, rpcUrl, runtime.cacheManager);
  }
};
var initWalletProvider = async (runtime) => {
  const privateKey = runtime.getSetting(CONFIG_KEYS.TON_PRIVATE_KEY);
  if (!privateKey) {
    throw new Error(`${CONFIG_KEYS.TON_PRIVATE_KEY} is missing`);
  }
  const mnemonics = privateKey.split(" ");
  if (mnemonics.length < 2) {
    throw new Error(`${CONFIG_KEYS.TON_PRIVATE_KEY} mnemonic seems invalid`);
  }
  const rpcUrl = runtime.getSetting("TON_RPC_URL") || PROVIDER_CONFIG.MAINNET_RPC;
  const keypair = await mnemonicToWalletKey(mnemonics);
  return new WalletProvider(keypair, rpcUrl, runtime.cacheManager);
};
var nativeWalletProvider = {
  async get(runtime, _message, _state) {
    try {
      const walletProvider = await initWalletProvider(runtime);
      const formattedPortfolio = await walletProvider.getFormattedPortfolio(runtime);
      console.log(formattedPortfolio);
      return formattedPortfolio;
    } catch (error) {
      console.error(
        `Error in ${PROVIDER_CONFIG.CHAIN_NAME_IN_DEXSCREENER.toUpperCase()} wallet provider:`,
        error
      );
      return null;
    }
  }
};

// src/actions/transfer.ts
import { internal as internal2 } from "@ton/ton";

// src/utils/util.ts
import { Address, beginCell, internal, SendMode } from "@ton/ton";
import pinataSDK from "@pinata/sdk";
import { readdirSync } from "fs";
import { writeFile, readFile } from "fs/promises";
import path2 from "path";
var sleep = async (ms) => {
  await new Promise((resolve) => setTimeout(resolve, ms));
};
var base64ToHex = (base64) => {
  return Buffer.from(base64, "base64").toString("hex");
};
function bufferToChunks(buff, chunkSize) {
  const chunks = [];
  while (buff.byteLength > 0) {
    chunks.push(buff.subarray(0, chunkSize));
    buff = buff.subarray(chunkSize);
  }
  return chunks;
}
function makeSnakeCell(data) {
  const chunks = bufferToChunks(data, 127);
  if (chunks.length === 0) {
    return beginCell().endCell();
  }
  if (chunks.length === 1) {
    return beginCell().storeBuffer(chunks[0]).endCell();
  }
  let curCell = beginCell();
  for (let i = chunks.length - 1; i >= 0; i--) {
    const chunk = chunks[i];
    curCell.storeBuffer(chunk);
    if (i - 1 >= 0) {
      const nextCell = beginCell();
      nextCell.storeRef(curCell);
      curCell = nextCell;
    }
  }
  return curCell.endCell();
}
function encodeOffChainContent(content) {
  let data = Buffer.from(content);
  const offChainPrefix = Buffer.from([1]);
  data = Buffer.concat([offChainPrefix, data]);
  return makeSnakeCell(data);
}
async function uploadFolderToIPFS(folderPath) {
  const pinata = new pinataSDK({
    pinataApiKey: process.env.PINATA_API_KEY,
    pinataSecretApiKey: process.env.PINATA_API_SECRET
  });
  const response = await pinata.pinFromFS(folderPath);
  return response.IpfsHash;
}
async function updateMetadataFiles(metadataFolderPath, imagesIpfsHash) {
  const files = readdirSync(metadataFolderPath);
  files.forEach(async (filename, index) => {
    const filePath = path2.join(metadataFolderPath, filename);
    const file = await readFile(filePath);
    const metadata = JSON.parse(file.toString());
    metadata.image = index != files.length - 1 ? `ipfs://${imagesIpfsHash}/${index}.jpg` : `ipfs://${imagesIpfsHash}/logo.jpg`;
    await writeFile(filePath, JSON.stringify(metadata));
  });
}
async function uploadJSONToIPFS(json) {
  const pinata = new pinataSDK({
    pinataApiKey: process.env.PINATA_API_KEY,
    pinataSecretApiKey: process.env.PINATA_API_SECRET
  });
  const response = await pinata.pinJSONToIPFS(json);
  return response.IpfsHash;
}
function formatCurrency(amount, digits) {
  try {
    return parseFloat(amount).toFixed(digits).toString();
  } catch (e) {
    return "0";
  }
}
async function topUpBalance(walletProvider, nftAmount, collectionAddress) {
  const feeAmount = 0.026;
  const walletClient = walletProvider.getWalletClient();
  const contract = walletClient.open(walletProvider.wallet);
  const seqno = await contract.getSeqno();
  const amount = nftAmount * feeAmount;
  await contract.sendTransfer({
    seqno,
    secretKey: walletProvider.keypair.secretKey,
    messages: [
      internal({
        value: amount.toString(),
        to: collectionAddress,
        bounce: false
      })
    ],
    sendMode: SendMode.PAY_GAS_SEPARATELY + SendMode.IGNORE_ERRORS
  });
  return seqno;
}
async function waitSeqnoContract(seqno, contract) {
  for (let attempt = 0; attempt < 10; attempt++) {
    await sleep(2e3);
    console.log("Transaction sent, still waiting for confirmation...");
    const seqnoAfter = await contract.getSeqno();
    if (seqnoAfter == seqno + 1) break;
  }
}
function sanitizeTonAddress(input, bounceable, testOnly) {
  try {
    const address = Address.parse(input);
    const sanitizedAddress = address.toString({ bounceable: bounceable ?? false, testOnly: testOnly ?? false });
    return sanitizedAddress;
  } catch (error) {
    console.error("Invalid TON address:", error.message);
    return null;
  }
}
function convertToBigInt(input) {
  const cleanedInput = typeof input === "string" ? input.replace(/_/g, "") : input;
  return BigInt(cleanedInput);
}

// src/actions/transfer.ts
function isTransferContent(content) {
  console.log("Content for transfer", content);
  return typeof content.recipient === "string" && (typeof content.amount === "string" || typeof content.amount === "number");
}
var transferTemplate = `Respond with a JSON markdown block containing only the extracted values. Use null for any values that cannot be determined.

Example response:
\`\`\`json
{
    "recipient": "EQCGScrZe1xbyWqWDvdI6mzP-GAcAWFv6ZXuaJOuSqemxku4",
    "amount": "1"
}
\`\`\`

{{recentMessages}}

Given the recent messages, extract the following information about the requested token transfer:
- Recipient wallet address
- Amount to transfer

Respond with a JSON markdown block containing only the extracted values.`;
var TransferAction = class {
  walletProvider;
  constructor(walletProvider) {
    this.walletProvider = walletProvider;
  }
  async transfer(params) {
    console.log(
      `Transferring: ${params.amount} tokens to (${params.recipient})`
    );
    const walletClient = this.walletProvider.getWalletClient();
    const contract = walletClient.open(this.walletProvider.wallet);
    try {
      const seqno = await contract.getSeqno();
      await sleep(1500);
      const transfer = contract.createTransfer({
        seqno,
        secretKey: this.walletProvider.keypair.secretKey,
        messages: [
          internal2({
            value: params.amount.toString().replace(/\\/g, ""),
            to: params.recipient,
            body: "eliza ton wallet plugin",
            bounce: false
          })
        ]
      });
      await sleep(1500);
      await contract.send(transfer);
      console.log("Transaction sent, still waiting for confirmation...");
      await sleep(1500);
      const state = await walletClient.getContractState(
        this.walletProvider.wallet.address
      );
      const { lt: _, hash: lastHash } = state.lastTransaction;
      return base64ToHex(lastHash);
    } catch (error) {
      throw new Error(`Transfer failed: ${error.message}`);
    }
  }
  async waitForTransaction(seqno, contract) {
    let currentSeqno = seqno;
    const startTime = Date.now();
    const TIMEOUT = 12e4;
    while (currentSeqno === seqno) {
      if (Date.now() - startTime > TIMEOUT) {
        throw new Error("Transaction confirmation timed out after 2 minutes");
      }
      await sleep(2e3);
      currentSeqno = await contract.getSeqno();
    }
    console.log("transaction confirmed!");
  }
};
var buildTransferDetails = async (runtime, message, state) => {
  const walletInfo = await nativeWalletProvider.get(runtime, message, state);
  state.walletInfo = walletInfo;
  let currentState = state;
  if (!currentState) {
    currentState = await runtime.composeState(message);
  } else {
    currentState = await runtime.updateRecentMessageState(currentState);
  }
  const transferSchema = z.object({
    recipient: z.string(),
    amount: z.union([z.string(), z.number()])
  });
  const transferContext = composeContext({
    state,
    template: transferTemplate
  });
  const content = await generateObject({
    runtime,
    context: transferContext,
    schema: transferSchema,
    modelClass: ModelClass.SMALL
  });
  let transferContent = content.object;
  if (transferContent === void 0) {
    transferContent = content;
  }
  return transferContent;
};
var transfer_default = {
  name: "SEND_TON_TOKEN",
  similes: ["SEND_TON", "SEND_TON_TOKENS"],
  description: "Call this action to send TON tokens to another wallet address. Supports sending any amount of TON to any valid TON wallet address. Transaction will be signed and broadcast to the TON blockchain.",
  handler: async (runtime, message, state, _options, callback) => {
    elizaLogger.log("Starting SEND_TOKEN handler...");
    const transferDetails = await buildTransferDetails(
      runtime,
      message,
      state
    );
    if (!isTransferContent(transferDetails)) {
      console.error("Invalid content for TRANSFER_TOKEN action.");
      if (callback) {
        callback({
          text: "Unable to process transfer request. Invalid content provided.",
          content: { error: "Invalid transfer content" }
        });
      }
      return false;
    }
    try {
      const walletProvider = await initWalletProvider(runtime);
      const action = new TransferAction(walletProvider);
      const hash = await action.transfer(transferDetails);
      if (callback) {
        callback({
          // TODO wait for transaction to complete
          text: `Successfully transferred ${transferDetails.amount} TON to ${transferDetails.recipient}, Transaction: ${hash}`,
          content: {
            success: true,
            hash,
            amount: transferDetails.amount,
            recipient: transferDetails.recipient
          }
        });
      }
      return true;
    } catch (error) {
      console.error("Error during token transfer:", error);
      if (callback) {
        callback({
          text: `Error transferring tokens: ${error.message}`,
          content: { error: error.message }
        });
      }
      return false;
    }
  },
  template: transferTemplate,
  // eslint-disable-next-line
  validate: async (_runtime) => {
    return true;
  },
  examples: [
    [
      {
        user: "{{user1}}",
        content: {
          text: "Send 1 TON tokens to EQCGScrZe1xbyWqWDvdI6mzP-GAcAWFv6ZXuaJOuSqemxku4",
          action: "SEND_TON_TOKEN"
        }
      },
      {
        user: "{{user2}}",
        content: {
          text: "I'll send 1 TON tokens now...",
          action: "SEND_TON_TOKEN"
        }
      },
      {
        user: "{{user2}}",
        content: {
          text: "Successfully sent 1 TON tokens to EQCGScrZe1xbyWqWDvdI6mzP-GAcAWFv6ZXuaJOuSqemxku4, Transaction: c8ee4a2c1bd070005e6cd31b32270aa461c69b927c3f4c28b293c80786f78b43"
        }
      }
    ],
    [
      {
        user: "{{user1}}",
        content: {
          text: "Transfer 0.5 TON to EQCD39VS5jcptHL8vMjEXrzGaRcCVYto7HUn4bpAOg8xqB2N",
          action: "SEND_TON_TOKEN"
        }
      },
      {
        user: "{{user2}}",
        content: {
          text: "Processing transfer of 0.5 TON...",
          action: "SEND_TON_TOKEN"
        }
      },
      {
        user: "{{user2}}",
        content: {
          text: "Successfully sent 0.5 TON to EQCD39VS5jcptHL8vMjEXrzGaRcCVYto7HUn4bpAOg8xqB2N, Transaction: c8ee4a2c1bd070005e6cd31b32270aa461c69b927c3f4c28b293c80786f78b43"
        }
      }
    ],
    [
      {
        user: "{{user1}}",
        content: {
          text: "Please move 2.5 TON to EQByzSQE5Mf_UBf5YYVF_fRhP_oZwM_h7mGAymWBjxkY5yVm",
          action: "SEND_TON_TOKEN"
        }
      },
      {
        user: "{{user2}}",
        content: {
          text: "Initiating transfer of 2.5 TON...",
          action: "SEND_TON_TOKEN"
        }
      },
      {
        user: "{{user2}}",
        content: {
          text: "Successfully sent 2.5 TON to EQByzSQE5Mf_UBf5YYVF_fRhP_oZwM_h7mGAymWBjxkY5yVm, Transaction: c8ee4a2c1bd070005e6cd31b32270aa461c69b927c3f4c28b293c80786f78b43"
        }
      }
    ]
  ]
};

// src/actions/createWallet.ts
import {
  elizaLogger as elizaLogger2,
  ModelClass as ModelClass2,
  generateObject as generateObject2,
  composeContext as composeContext2
} from "@elizaos/core";
function isCreateWalletContent(content) {
  return typeof content.encryptionPassword === "string";
}
var passwordSchema = z.object({
  encryptionPassword: z.string().min(1, "Encryption password is required and cannot be empty.")
});
var passwordTemplate = `Respond with a JSON markdown block containing only the extracted values. Use null for any values that cannot be determined.
  Example response:
  \`\`\`json
  {
    "encryptionPassword": "<your password here>"
  }
  \`\`\`
  
  {{recentMessages}}

  Respond with a JSON markdown block containing only the extracted values.`;
async function buildCreateWalletDetails(runtime, message, state) {
  const currentState = state || await runtime.composeState(message);
  const context = composeContext2({
    state: currentState,
    template: passwordTemplate
  });
  const result = await generateObject2({
    runtime,
    context,
    schema: passwordSchema,
    modelClass: ModelClass2.SMALL
  });
  let passwordData = result.object;
  if (!passwordData) {
    passwordData = result;
  }
  let createWalletContent = passwordData;
  if (createWalletContent === void 0) {
    createWalletContent = passwordData;
  }
  return createWalletContent;
}
var CreateWalletAction = class {
  runtime;
  constructor(runtime) {
    this.runtime = runtime;
  }
  async createWallet(params) {
    const { walletProvider, mnemonic } = await WalletProvider.generateNew(params.rpcUrl, params.encryptionPassword, this.runtime.cacheManager);
    const walletAddress = walletProvider.getAddress();
    return { walletAddress, mnemonic };
  }
};
var createWallet_default = {
  name: "CREATE_TON_WALLET",
  similes: ["NEW_TON_WALLET", "MAKE_NEW_TON_WALLET"],
  description: "Creates a new TON wallet on demand. Returns the public address and mnemonic backup (store it securely). The wallet keypair is also encrypted to a file using the provided password.",
  handler: async (runtime, message, state, _options, callback) => {
    elizaLogger2.log("Starting CREATE_TON_WALLET action...");
    const createWalletContent = await buildCreateWalletDetails(runtime, message, state);
    elizaLogger2.debug("createWalletContent", createWalletContent);
    if (!isCreateWalletContent(createWalletContent)) {
      if (callback) {
        callback({
          text: "Unable to process create wallet request. No password provided.",
          content: { error: "Invalid create wallet. No password provided." }
        });
      }
      return false;
    }
    try {
      const rpcUrl = runtime.getSetting("TON_RPC_URL") || "https://toncenter.com/api/v2/jsonRPC";
      const action = new CreateWalletAction(runtime);
      const { walletAddress, mnemonic } = await action.createWallet({ rpcUrl, encryptionPassword: createWalletContent.encryptionPassword });
      const result = {
        status: "success",
        walletAddress,
        mnemonic,
        // IMPORTANT: The mnemonic backup must be stored securely!
        message: "New TON wallet created. Store the mnemonic securely for recovery."
      };
      if (callback) {
        callback({
          text: `
New TON wallet created!
Your password was used to encrypt the wallet keypair, but never stored.
Wallet Address: ${walletAddress}
I've used both your password and the mnemonic to create the wallet.
Please securely store your mnemonic:
${mnemonic.join(" ")}`,
          content: result
        });
      }
      return true;
    } catch (error) {
      elizaLogger2.error("Error creating wallet:", error);
      if (callback) {
        callback({
          text: `Error creating wallet: ${error.message}`,
          content: { error: error.message }
        });
      }
      return false;
    }
  },
  validate: async (_runtime) => true,
  examples: [
    [
      {
        user: "{{user1}}",
        content: {
          text: "Please create a new TON wallet for me.",
          action: "CREATE_TON_WALLET"
        }
      },
      {
        user: "{{user1}}",
        content: {
          text: "New TON wallet created!/n Your password was used to encrypt the wallet keypair, but never stored./nWallet Address: EQAXxxxxxxxxxxxxxxxxxxxxxx./n I've used both your password and the mnemonic to create the wallet./nPlease securely store your mnemonic"
        }
      }
    ],
    [
      {
        user: "{{user1}}",
        content: {
          text: "Please make me a new TON wallet.",
          action: "CREATE_TON_WALLET"
        }
      },
      {
        user: "{{user1}}",
        content: {
          text: "New TON wallet created!/n Your password was used to encrypt the wallet keypair, but never stored./nWallet Address: EQAXxxxxxxxxxxxxxxxxxxxxxx./n I've used both your password and the mnemonic to create the wallet./nPlease securely store your mnemonic"
        }
      }
    ]
  ]
};

// src/actions/loadWallet.ts
import {
  elizaLogger as elizaLogger3,
  composeContext as composeContext3,
  generateObject as generateObject3,
  ModelClass as ModelClass3
} from "@elizaos/core";
function isRecoverWalletContent(content) {
  return typeof content.password === "string" && typeof content.walletAddress === "string";
}
var recoverWalletSchema = z.object({
  password: z.string().min(1, "Password is required and cannot be empty."),
  walletAddress: z.string().min(1, "Wallet address is required and cannot be empty.")
});
var recoverWalletTemplate = `Respond with a JSON markdown block containing only the extracted values. Use null for any values that cannot be determined.
  Example response:
  \`\`\`json
  {
    "password": "my_password",
    "walletAddress": "EQAXxxxxxxxxxxxxxxxxxxxxxx"
  }
  \`\`\`
  
  {{recentMessages}}

  Respond with a JSON markdown block containing only the extracted values`;
async function buildRecoverWalletDetails(runtime, message, state) {
  const currentState = state || await runtime.composeState(message);
  const context = composeContext3({
    state: currentState,
    template: recoverWalletTemplate
  });
  const result = await generateObject3({
    runtime,
    context,
    schema: recoverWalletSchema,
    modelClass: ModelClass3.SMALL
  });
  let passwordData = result.object;
  if (!passwordData) {
    passwordData = result;
  }
  let recoverWalletContent = passwordData;
  if (recoverWalletContent === void 0) {
    recoverWalletContent = passwordData;
  }
  return recoverWalletContent;
}
var loadWallet_default = {
  name: "RECOVER_TON_WALLET",
  similes: ["IMPORT_TON_WALLET", "RECOVER_WALLET"],
  description: "Loads an existing TON wallet from an encrypted backup file using the provided password.",
  handler: async (runtime, message, state, _options, callback) => {
    elizaLogger3.log("Starting RECOVER_TON_WALLET action...");
    const recoverWalletContent = await buildRecoverWalletDetails(runtime, message, state);
    if (!isRecoverWalletContent(recoverWalletContent)) {
      if (callback) {
        callback({
          text: "Unable to process load wallet request. No password or address provided.",
          content: { error: "Invalid load wallet. No password or address provided." }
        });
      }
      return false;
    }
    try {
      elizaLogger3.debug("recoverWalletContent", recoverWalletContent);
      const password = recoverWalletContent.password;
      if (!password) {
        if (callback) {
          callback({
            text: "Unable to process load wallet request. No password provided.",
            content: { error: "Invalid load wallet. No password provided." }
          });
          return false;
        }
      }
      const walletAddress = recoverWalletContent.walletAddress;
      if (!walletAddress) {
        if (callback) {
          callback({
            text: "Unable to process load wallet request. No wallet address provided.",
            content: { error: "Invalid load wallet. No wallet address provided." }
          });
          return false;
        }
      }
      const walletProvider = await WalletProvider.importWalletFromFile(runtime, walletAddress, password);
      const result = {
        status: "success",
        walletAddress,
        message: `
Wallet recovered successfully.
Your Decrypted wallet is: ${JSON.stringify(walletProvider.keypair)}.
Please store it securely.`
      };
      if (callback) {
        callback({
          text: `Wallet recovered successfully.

 Your Decrypted wallet is: ${JSON.stringify(walletProvider.keypair)}.

 Please store it securely.`,
          content: result
        });
      }
      return true;
    } catch (error) {
      elizaLogger3.error("Error recovering wallet:", error);
      if (callback) {
        callback({
          text: `Error recovering wallet: ${error.message}`,
          content: { error: error.message }
        });
      }
      return false;
    }
  },
  validate: async (_runtime) => true,
  examples: [
    [
      {
        user: "{{user1}}",
        content: {
          text: "Please recover my TON wallet. My decryption password is my_password and my wallet address is EQAXxxxxxxxxxxxxxxxxxxxxxx.",
          action: "RECOVER_TON_WALLET"
        }
      },
      {
        user: "{{user1}}",
        content: {
          text: "Wallet recovered successfully. Your Decrypted wallet is: ${JSON.stringify(walletProvider.keypair)}. Please store it securely."
        }
      }
    ]
  ]
};

// src/actions/evaaBorrow.ts
import {
  elizaLogger as elizaLogger4,
  ModelClass as ModelClass4,
  composeContext as composeContext4,
  generateObject as generateObject4
} from "@elizaos/core";
import BigNumber2 from "bignumber.js";
import evaaPkg from "@evaafi/sdk";
import { Cell as Cell2, toNano, beginCell as beginCell2, storeMessage, internal as internal3, external, SendMode as SendMode2 } from "@ton/ton";
var {
  Evaa,
  FEES,
  TON_TESTNET,
  TESTNET_POOL_CONFIG,
  JUSDC_TESTNET,
  JUSDT_TESTNET,
  UserDataActive,
  AssetData,
  BalanceChangeType,
  calculatePresentValue,
  calculateCurrentRates,
  MasterConstants,
  AssetConfig,
  ExtendedAssetData,
  PoolAssetConfig,
  mulFactor,
  predictAPY,
  PricesCollector
} = evaaPkg;
var borrowSchema = z.object({
  amount: z.string(),
  asset: z.string().nullable().optional().transform((val) => val === null ? "TON" : val),
  includeUserCode: z.boolean().nullable().optional().transform((val) => val === null ? false : val),
  showInterest: z.boolean().nullable().optional().transform((val) => val === null ? false : val)
});
function isBorrowContent(content) {
  return (typeof content.amount === "string" || typeof content.amount === "number") && (content.asset === void 0 || typeof content.asset === "string") && (content.includeUserCode === void 0 || typeof content.includeUserCode === "boolean") && (content.showInterest === void 0 || typeof content.showInterest === "boolean");
}
var borrowTemplate = `Respond with a JSON markdown block containing only the extracted values. Use null for any values that cannot be determined.

Example response:
\`\`\`json
{
    "amount": "1",
    "asset": "USDT" | "USDC" | "TON",
    "includeUserCode": true,
    "showInterest": true
}
\`\`\`

{{recentMessages}}

Given the recent messages, extract the following information about the requested borrowing operation:
- Amount to borrow
- Asset to borrow
- Whether to include user code (optional)
- Whether to show interest calculation (optional)
- Make sure to remove \`\`\`json and \`\`\` from the response

Respond with a JSON markdown block containing only the extracted values.`;
var BorrowAction = class {
  walletProvider;
  evaa;
  assetsData;
  assetsConfig;
  masterConstants;
  USDT;
  USDC;
  TON;
  /*private usdtData: typeof ExtendedAssetData;
  private usdtConfig: typeof AssetConfig;
  private usdcData: typeof ExtendedAssetData;
  private usdcConfig: typeof AssetConfig;
  private tonData: typeof ExtendedAssetData;
  private tonConfig: typeof AssetConfig;*/
  totalSupply;
  totalBorrow;
  collector;
  borrowInterest;
  predictAPY;
  withdrawalLimits;
  borrowLimits;
  constructor(walletProvider) {
    this.walletProvider = walletProvider;
    this.evaa = null;
    this.assetsData = null;
    this.assetsConfig = null;
    this.masterConstants = null;
    this.USDT = null;
    this.USDC = null;
    this.TON = null;
    this.totalSupply = null;
    this.totalBorrow = null;
    this.borrowInterest = null;
    this.predictAPY = null;
    this.collector = null;
    this.withdrawalLimits = null;
    this.borrowLimits = null;
  }
  async waitForPrincipalChange(addr, asset, func, currentEvaa = this.evaa, currentClient = this.walletProvider.getWalletClient()) {
    let prevPrincipal = 0n;
    let user = currentClient.open(await currentEvaa.openUserContract(addr));
    await user.getSync(currentEvaa.data.assetsData, currentEvaa.data.assetsConfig, (await this.collector.getPrices()).dict);
    if (user.data?.type == "active") {
      prevPrincipal = user.data.principals.get(asset.assetId) ?? 0n;
    }
    await new Promise((resolve) => setTimeout(resolve, 1e3));
    await func();
    while (true) {
      user = currentClient.open(await currentEvaa.openUserContract(addr));
      await user.getSync(currentEvaa.data.assetsData, currentEvaa.data.assetsConfig, (await this.collector.getPrices()).dict);
      if (user.data?.type == "active") {
        const principalNow = user.data.principals.get(asset.assetId) ?? 0n;
        if (Math.abs(Number(principalNow - prevPrincipal)) > 10) {
          return { principal: principalNow, data: user.data };
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 4e3));
    }
  }
  async borrow(params, runtime, callback) {
    const walletClient = this.walletProvider.getWalletClient();
    const wallet = walletClient.open(this.walletProvider.wallet);
    const tonExplorerUrl = runtime.getSetting("TON_EXPLORER_URL") || "https://testnet.tonviewer.com/";
    this.evaa = walletClient.open(
      new Evaa({ poolConfig: TESTNET_POOL_CONFIG })
    );
    await this.evaa.getSync();
    this.assetsData = this.evaa.data?.assetsData;
    this.assetsConfig = this.evaa.data?.assetsConfig;
    this.masterConstants = this.evaa.poolConfig.masterConstants;
    this.USDT = {
      name: "USDT",
      data: this.assetsData.get(JUSDT_TESTNET.assetId),
      config: this.assetsConfig.get(JUSDT_TESTNET.assetId),
      asset: JUSDT_TESTNET
    };
    this.USDC = {
      name: "USDC",
      data: this.assetsData.get(JUSDC_TESTNET.assetId),
      config: this.assetsConfig.get(JUSDC_TESTNET.assetId),
      asset: JUSDC_TESTNET
    };
    this.TON = {
      name: "TON",
      data: this.assetsData.get(TON_TESTNET.assetId),
      config: this.assetsConfig.get(TON_TESTNET.assetId),
      asset: TON_TESTNET
    };
    this.totalSupply = calculatePresentValue(this.TON.data.sRate, this.TON.data.totalSupply, this.masterConstants);
    this.totalBorrow = calculatePresentValue(this.TON.data.bRate, this.TON.data.totalBorrow, this.masterConstants);
    this.borrowInterest = this.TON.config.baseBorrowRate + mulFactor(this.masterConstants.FACTOR_SCALE, this.TON.config.borrowRateSlopeLow, this.TON.config.targetUtilization) + mulFactor(
      this.masterConstants.FACTOR_SCALE,
      this.TON.config.borrowRateSlopeHigh,
      this.masterConstants.FACTOR_SCALE - this.TON.config.targetUtilization
    );
    this.predictAPY = predictAPY({
      amount: this.totalBorrow,
      balanceChangeType: BalanceChangeType.Repay,
      assetData: this.TON.data,
      assetConfig: this.TON.config,
      masterConstants: this.masterConstants
    });
    this.collector = new PricesCollector(TESTNET_POOL_CONFIG);
    const borrower = walletClient.open(this.evaa.openUserContract(wallet.address));
    await borrower.getSync(this.evaa.data.assetsData, this.evaa.data.assetsConfig, (await this.collector.getPrices()).dict, true);
    const data = borrower.data;
    elizaLogger4.log("User data:", data.fullyParsed);
    if (borrower.data?.type != "active") {
      elizaLogger4.log("Borrower User is inactive");
      if (callback) {
        callback({
          text: `You need provide collateral funds before you can borrow`,
          content: { error: "No collateral funds provided." }
        });
        return false;
      }
    } else {
      let formatFixedPoint = function(x, decimals = 13) {
        const factor = 10 ** decimals;
        return (Number(x) / factor).toFixed(6);
      };
      this.withdrawalLimits = borrower.data.withdrawalLimits;
      this.borrowLimits = borrower.data.borrowLimits;
      elizaLogger4.debug("User principals");
      elizaLogger4.debug("Real Principals", borrower.data.realPrincipals);
      elizaLogger4.debug("User Principal", borrower.data.principals);
      elizaLogger4.debug("Get Prices For Withdraw [USDT]", (await this.collector.getPricesForWithdraw(borrower.data.realPrincipals, JUSDT_TESTNET)).dict);
      elizaLogger4.debug("Get Prices For Withdraw [USDC]", (await this.collector.getPricesForWithdraw(borrower.data.realPrincipals, JUSDC_TESTNET)).dict);
      let amoundToRepayTON = data.balances.get(TON_TESTNET.assetId).amount;
      elizaLogger4.debug("Amount to repay [TON]", new BigNumber2(amoundToRepayTON).toFixed(4));
      let amoundToRepayUSDT = data.balances.get(JUSDT_TESTNET.assetId).amount;
      elizaLogger4.debug("Amount to repay [USDT]", new BigNumber2(amoundToRepayUSDT).toFixed(2));
      let amoundToRepayUSDC = data.balances.get(JUSDC_TESTNET.assetId).amount;
      elizaLogger4.debug("Amount to repay [USDC]", new BigNumber2(amoundToRepayUSDC).toFixed(2));
      const borrowAmount = typeof params.amount !== "string" ? new BigNumber2(String(params.amount)) : new BigNumber2(params.amount);
      const tonAsset = params.asset === "TON" ? this.TON : params.asset === "USDT" ? this.USDT : params.asset === "USDC" ? this.USDC : this.TON;
      if (!tonAsset) {
        throw new Error("TON asset not found in master data");
      }
      elizaLogger4.debug("Borrow amount", borrowAmount.toFixed(4));
      elizaLogger4.debug("Borrow limits", this.borrowLimits);
      const assetRates = calculateCurrentRates(tonAsset.config, tonAsset.data, this.masterConstants);
      const { borrowInterest, bRate, now, sRate, supplyInterest } = assetRates;
      const ONE = 10n ** 13n;
      const annualInterestRateReadable = Number(sRate) / Number(ONE);
      const dailyInterestRateReadable = annualInterestRateReadable / 365;
      const annualRateFP = sRate;
      const dailyRateFP = sRate / 365n;
      const principal = 10n * ONE;
      const dailyInterestFP = principal * dailyRateFP / ONE;
      elizaLogger4.debug("Borrow Interest", borrowInterest.toString());
      elizaLogger4.debug("Borrow Rate", bRate.toString());
      elizaLogger4.debug("Supply Interest", supplyInterest.toString());
      elizaLogger4.debug("Supply Rate", sRate.toString());
      elizaLogger4.debug("Now", now.toString());
      elizaLogger4.debug("Annual Interest Rate: ", annualInterestRateReadable.toString());
      elizaLogger4.debug("Daily Interest Rate:  ", dailyInterestRateReadable.toString());
      elizaLogger4.debug("Daily Interest (on 10 tokens):", formatFixedPoint(dailyInterestFP));
      const annualInterestRate = annualInterestRateReadable;
      const dailyInterestRate = dailyInterestRateReadable;
      const dailyInterest = formatFixedPoint(dailyInterestFP);
      const priceData = await this.collector.getPrices();
      const supplyMessage = this.evaa.createSupplyMessage({
        queryID: 0n,
        // we can set always to true, if we don't want to check user code version
        includeUserCode: true,
        amount: toNano(params.amount),
        userAddress: wallet.address,
        asset: this.TON.asset,
        payload: Cell2.EMPTY,
        amountToTransfer: toNano(0)
      });
      const signedSupplyMessage = wallet.createTransfer({
        seqno: await wallet.getSeqno(),
        secretKey: this.walletProvider.keypair.secretKey,
        messages: [
          internal3({
            to: this.evaa.address,
            value: toNano(params.amount) + FEES.SUPPLY,
            body: supplyMessage
          })
        ],
        sendMode: SendMode2.PAY_GAS_SEPARATELY,
        timeout: Math.floor(Date.now() / 1e3) + 60
      });
      await wallet.send(signedSupplyMessage);
      const externalSupplyMessage = beginCell2().store(
        storeMessage(
          external({
            to: wallet.address,
            body: signedSupplyMessage
          })
        )
      ).endCell();
      await this.evaa.getSync();
      await sleep(3e4);
      const withdrawMessage = this.evaa.createWithdrawMessage({
        queryID: 0n,
        // we can set always to true, if we don't want to check user code version
        includeUserCode: true,
        amount: convertToBigInt(Number(params.amount) * 1e6),
        //0xFFFFFFFFFFFFFFFFn, //toNano(params.amount),
        userAddress: wallet.address,
        asset: tonAsset.asset,
        payload: Cell2.EMPTY,
        priceData: priceData.dataCell,
        amountToTransfer: toNano(0)
      });
      const signedMessage = wallet.createTransfer({
        seqno: await wallet.getSeqno(),
        secretKey: this.walletProvider.keypair.secretKey,
        messages: [
          internal3({
            to: this.evaa.address,
            value: toNano(1) + FEES.WITHDRAW,
            body: withdrawMessage
          })
        ],
        sendMode: SendMode2.PAY_GAS_SEPARATELY,
        timeout: Math.floor(Date.now() / 1e3) + 60
      });
      await wallet.send(signedMessage);
      const externalMessage = beginCell2().store(
        storeMessage(
          external({
            to: wallet.address,
            body: signedSupplyMessage
          })
        )
      ).endCell();
      await this.evaa.getSync();
      await sleep(3e4);
      const txHash = externalMessage.hash().toString("hex");
      const explorerUrl = `${tonExplorerUrl}/transaction/${txHash}`;
      let amountToRepay = data.balances.get(tonAsset.asset.assetId).amount;
      elizaLogger4.debug("Amount to repay", amountToRepay.toString());
      return {
        txHash,
        explorerUrl,
        asset: tonAsset.name,
        amount: borrowAmount.toString(),
        amountToRepay: amountToRepay.toString(),
        dailyInterest,
        annualInterestRate
      };
    }
  }
};
var borrowAction = {
  name: "EVAA_BORROW",
  similes: [
    "GET_USDT_LOAN",
    "TAKE_USDT_LOAN",
    "BORROW_USDT",
    "GET_USDC_LOAN",
    "TAKE_USDC_LOAN",
    "BORROW_USDC",
    "GET_TON_LOAN",
    "TAKE_TON_LOAN",
    "BORROW_TON",
    "BORROW_TONCOIN",
    "GET_TONCOIN_LOAN"
  ],
  description: "Borrow TON, USDT and USDC tokens from the EVAA lending protocol",
  validate: async (runtime) => {
    const walletProvider = await initWalletProvider(runtime);
    return !!walletProvider.getAddress();
  },
  handler: async (runtime, message, state, options, callback) => {
    elizaLogger4.info("Starting EVAA BORROW handler");
    try {
      const borrowContext = composeContext4({
        state,
        template: borrowTemplate
      });
      const content = await generateObject4({
        runtime,
        context: borrowContext,
        schema: borrowSchema,
        modelClass: ModelClass4.LARGE
      });
      const borrowDetails = content.object;
      elizaLogger4.debug(`Borrow details: ${JSON.stringify(content.object)}`);
      if (!isBorrowContent(borrowDetails)) {
        throw new Error("Invalid borrowing parameters");
      }
      const walletProvider = await initWalletProvider(runtime);
      const action = new BorrowAction(walletProvider);
      const borrowResult = await action.borrow(borrowDetails, runtime, callback);
      if (callback) {
        let responseText = `Successfully initiated borrowing of ${borrowDetails.amount} ${borrowResult.asset}.`;
        if (borrowDetails.showInterest) {
          const formattedDailyInterest = Number(borrowResult.dailyInterest).toFixed(4);
          const formattedAnnualRate = (Number(borrowResult.annualInterestRate) * 100).toFixed(2);
          responseText += `

Amount to Repay: ${Number(borrowResult.amountToRepay).toFixed(4)} ${borrowResult.asset}

Estimated Interest:
- Daily Interest: ${formattedDailyInterest} ${borrowResult.asset}
- Annual Interest Rate: ${formattedAnnualRate}%`;
        }
        responseText += `

Track the transaction here: ${borrowResult.explorerUrl}`;
        callback({
          text: responseText,
          metadata: {
            txHash: borrowResult.txHash,
            explorerUrl: borrowResult.explorerUrl,
            asset: borrowResult.asset,
            amount: borrowDetails.amount,
            amountToRepay: borrowResult.amountToRepay,
            dailyInterest: borrowResult.dailyInterest.toString(),
            annualInterestRate: borrowResult.annualInterestRate.toString(),
            action: "BORROW"
          }
        });
      }
      return true;
    } catch (error) {
      elizaLogger4.error(`Error in EVAA BORROW handler: ${error}`);
      if (callback) {
        callback({
          text: `Failed to borrow: ${error.message}`,
          error: true
        });
      }
      return false;
    }
  },
  examples: [
    [
      {
        user: "{{user1}}",
        content: {
          text: "I want to borrow 1 TON from the EVAA protocol and see the interest calculation"
        }
      },
      {
        user: "{{agentName}}",
        content: {
          text: "I'll help you borrow 1 TON from the EVAA protocol and show you the interest details. Processing your request...",
          action: "BORROW_TON"
        }
      }
    ],
    [
      {
        user: "{{user1}}",
        content: {
          text: "Can you get me a loan of 0.5 TON from EVAA with user code included?"
        }
      },
      {
        user: "{{agentName}}",
        content: {
          text: "I'll help you borrow 0.5 TON from EVAA with user code included. Processing your request...",
          action: "BORROW_TON"
        }
      }
    ]
  ]
};
var evaaBorrow_default = borrowAction;

// src/actions/evaaSupply.ts
import {
  elizaLogger as elizaLogger5,
  ModelClass as ModelClass5,
  generateObject as generateObject5,
  composeContext as composeContext5
} from "@elizaos/core";
import BigNumber3 from "bignumber.js";
import evaaPkg2 from "@evaafi/sdk";
import { Cell as Cell3, toNano as toNano2, beginCell as beginCell3, storeMessage as storeMessage2, internal as internal4, external as external2, SendMode as SendMode3 } from "@ton/ton";
var {
  Evaa: Evaa2,
  FEES: FEES2,
  TON_TESTNET: TON_TESTNET2,
  TESTNET_POOL_CONFIG: TESTNET_POOL_CONFIG2,
  JUSDC_TESTNET: JUSDC_TESTNET2,
  JUSDT_TESTNET: JUSDT_TESTNET2,
  UserDataActive: UserDataActive2,
  AssetData: AssetData2,
  BalanceChangeType: BalanceChangeType2,
  calculatePresentValue: calculatePresentValue2,
  calculateCurrentRates: calculateCurrentRates2,
  MasterConstants: MasterConstants2,
  AssetConfig: AssetConfig2,
  ExtendedAssetData: ExtendedAssetData2,
  PoolAssetConfig: PoolAssetConfig2,
  mulFactor: mulFactor2,
  predictAPY: predictAPY2,
  PricesCollector: PricesCollector2
} = evaaPkg2;
var supplySchema = z.object({
  amount: z.string(),
  asset: z.string().nullable().optional().transform((val) => val === null ? "TON" : val),
  includeUserCode: z.boolean().nullable().optional().transform((val) => val === null ? false : val),
  showInterest: z.boolean().nullable().optional().transform((val) => val === null ? false : val)
});
function isSupplyContent(content) {
  return (typeof content.amount === "string" || typeof content.amount === "number") && (content.asset === void 0 || typeof content.asset === "string") && (content.includeUserCode === void 0 || typeof content.includeUserCode === "boolean") && (content.showInterest === void 0 || typeof content.showInterest === "boolean");
}
var lendTemplate = `Respond with a JSON markdown block containing only the extracted values. Use null for any values that cannot be determined.

Example response:
\`\`\`json
{
    "amount": "1",
    "asset": "USDT" | "USDC" | "TON",
    "includeUserCode": true,
    "showInterest": true
}
\`\`\`

{{recentMessages}}

Given the recent messages, extract the following information about the requested lending operation:
- Amount to supply
- Asset to supply
- Whether to include user code (optional)
- Make sure to remove \`\`\`json and \`\`\` from the response

Respond with a JSON markdown block containing only the extracted values.`;
var SupplyAction = class {
  walletProvider;
  evaa;
  assetsData;
  assetsConfig;
  masterConstants;
  USDT;
  USDC;
  TON;
  totalSupply;
  totalBorrow;
  collector;
  borrowInterest;
  predictAPY;
  withdrawalLimits;
  borrowLimits;
  constructor(walletProvider) {
    this.walletProvider = walletProvider;
    this.evaa = null;
    this.assetsData = null;
    this.assetsConfig = null;
    this.masterConstants = null;
    this.USDT = null;
    this.USDC = null;
    this.TON = null;
    this.totalSupply = null;
    this.totalBorrow = null;
    this.borrowInterest = null;
    this.predictAPY = null;
    this.collector = null;
    this.withdrawalLimits = null;
    this.borrowLimits = null;
  }
  async waitForPrincipalChange(addr, asset, func, currentEvaa = this.evaa, currentClient = this.walletProvider.getWalletClient()) {
    let prevPrincipal = 0n;
    let user = currentClient.open(await currentEvaa.openUserContract(addr));
    await user.getSync(currentEvaa.data.assetsData, currentEvaa.data.assetsConfig, (await this.collector.getPrices()).dict);
    if (user.data?.type == "active") {
      prevPrincipal = user.data.principals.get(asset.assetId) ?? 0n;
    }
    await new Promise((resolve) => setTimeout(resolve, 1e3));
    await func();
    while (true) {
      user = currentClient.open(await currentEvaa.openUserContract(addr));
      await user.getSync(currentEvaa.data.assetsData, currentEvaa.data.assetsConfig, (await this.collector.getPrices()).dict);
      if (user.data?.type == "active") {
        const principalNow = user.data.principals.get(asset.assetId) ?? 0n;
        if (Math.abs(Number(principalNow - prevPrincipal)) > 10) {
          return { principal: principalNow, data: user.data };
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 4e3));
    }
  }
  async supply(params, runtime, callback) {
    const walletClient = this.walletProvider.getWalletClient();
    const wallet = walletClient.open(this.walletProvider.wallet);
    const tonExplorerUrl = runtime.getSetting("TON_EXPLORER_URL") || "https://testnet.tonviewer.com/";
    this.evaa = walletClient.open(
      new Evaa2({ poolConfig: TESTNET_POOL_CONFIG2 })
    );
    await this.evaa.getSync();
    this.assetsData = this.evaa.data?.assetsData;
    this.assetsConfig = this.evaa.data?.assetsConfig;
    this.masterConstants = this.evaa.poolConfig.masterConstants;
    this.USDT = {
      name: "USDT",
      data: this.assetsData.get(JUSDT_TESTNET2.assetId),
      config: this.assetsConfig.get(JUSDT_TESTNET2.assetId),
      asset: JUSDT_TESTNET2
    };
    this.USDC = {
      name: "USDC",
      data: this.assetsData.get(JUSDC_TESTNET2.assetId),
      config: this.assetsConfig.get(JUSDC_TESTNET2.assetId),
      asset: JUSDC_TESTNET2
    };
    this.TON = {
      name: "TON",
      data: this.assetsData.get(TON_TESTNET2.assetId),
      config: this.assetsConfig.get(TON_TESTNET2.assetId),
      asset: TON_TESTNET2
    };
    this.totalSupply = calculatePresentValue2(this.TON.data.sRate, this.TON.data.totalSupply, this.masterConstants);
    this.totalBorrow = calculatePresentValue2(this.TON.data.bRate, this.TON.data.totalBorrow, this.masterConstants);
    this.borrowInterest = this.TON.config.baseBorrowRate + mulFactor2(this.masterConstants.FACTOR_SCALE, this.TON.config.borrowRateSlopeLow, this.TON.config.targetUtilization) + mulFactor2(
      this.masterConstants.FACTOR_SCALE,
      this.TON.config.borrowRateSlopeHigh,
      this.masterConstants.FACTOR_SCALE - this.TON.config.targetUtilization
    );
    this.predictAPY = predictAPY2({
      amount: this.totalBorrow,
      balanceChangeType: BalanceChangeType2.Repay,
      assetData: this.TON.data,
      assetConfig: this.TON.config,
      masterConstants: this.masterConstants
    });
    this.collector = new PricesCollector2(TESTNET_POOL_CONFIG2);
    const borrower = walletClient.open(this.evaa.openUserContract(wallet.address));
    await borrower.getSync(this.evaa.data.assetsData, this.evaa.data.assetsConfig, (await this.collector.getPrices()).dict, true);
    const data = borrower.data;
    elizaLogger5.log("User data:", data.fullyParsed);
    if (borrower.data?.type != "active") {
      elizaLogger5.log("Borrower User is inactive");
      const borrowAmount = typeof params.amount !== "string" ? new BigNumber3(String(params.amount)) : new BigNumber3(params.amount);
      const tonAsset = params.asset === "TON" ? this.TON : params.asset === "USDT" ? this.USDT : params.asset === "USDC" ? this.USDC : this.TON;
      if (!tonAsset) {
        throw new Error("TON asset not found in master data");
      }
      const supplyMessage = this.evaa.createSupplyMessage({
        queryID: 0n,
        // we can set always to true, if we don't want to check user code version
        includeUserCode: true,
        amount: tonAsset.name === "TON" ? toNano2(params.amount) : convertToBigInt(Number(params.amount) * 1e6),
        userAddress: wallet.address,
        asset: tonAsset.asset,
        payload: Cell3.EMPTY,
        amountToTransfer: toNano2(0)
      });
      const signedSupplyMessage = wallet.createTransfer({
        seqno: await wallet.getSeqno(),
        secretKey: this.walletProvider.keypair.secretKey,
        messages: [
          internal4({
            to: this.evaa.address,
            value: toNano2(params.amount) + FEES2.SUPPLY,
            body: supplyMessage
          })
        ],
        sendMode: SendMode3.PAY_GAS_SEPARATELY,
        timeout: Math.floor(Date.now() / 1e3) + 60
      });
      await wallet.send(signedSupplyMessage);
      const externalSupplyMessage = beginCell3().store(
        storeMessage2(
          external2({
            to: wallet.address,
            body: signedSupplyMessage
          })
        )
      ).endCell();
      await this.evaa.getSync();
      await sleep(3e4);
      const txHash = externalSupplyMessage.hash().toString("hex");
      const explorerUrl = `${tonExplorerUrl}/transaction/${txHash}`;
      return {
        txHash,
        explorerUrl,
        asset: tonAsset.name,
        amount: borrowAmount.toString(),
        amountToRepay: 0,
        dailyInterest: 0,
        annualInterestRate: 0
      };
    } else {
      let formatFixedPoint = function(x, decimals = 13) {
        const factor = 10 ** decimals;
        return (Number(x) / factor).toFixed(6);
      };
      this.withdrawalLimits = borrower.data.withdrawalLimits;
      this.borrowLimits = borrower.data.borrowLimits;
      elizaLogger5.debug("User principals");
      elizaLogger5.debug("Real Principals", borrower.data.realPrincipals);
      elizaLogger5.debug("User Principal", borrower.data.principals);
      elizaLogger5.debug("Get Prices For Withdraw [USDT]", (await this.collector.getPricesForWithdraw(borrower.data.realPrincipals, JUSDT_TESTNET2)).dict);
      elizaLogger5.debug("Get Prices For Withdraw [USDC]", (await this.collector.getPricesForWithdraw(borrower.data.realPrincipals, JUSDC_TESTNET2)).dict);
      let amoundToRepayTON = data.balances.get(TON_TESTNET2.assetId).amount;
      elizaLogger5.debug("Amount to repay [TON]", new BigNumber3(amoundToRepayTON).toFixed(4));
      let amoundToRepayUSDT = data.balances.get(JUSDT_TESTNET2.assetId).amount;
      elizaLogger5.debug("Amount to repay [USDT]", new BigNumber3(amoundToRepayUSDT).toFixed(2));
      let amoundToRepayUSDC = data.balances.get(JUSDC_TESTNET2.assetId).amount;
      elizaLogger5.debug("Amount to repay [USDC]", new BigNumber3(amoundToRepayUSDC).toFixed(2));
      const borrowAmount = typeof params.amount !== "string" ? new BigNumber3(String(params.amount)) : new BigNumber3(params.amount);
      const tonAsset = params.asset === "TON" ? this.TON : params.asset === "USDT" ? this.USDT : params.asset === "USDC" ? this.USDC : this.TON;
      if (!tonAsset) {
        throw new Error("TON asset not found in master data");
      }
      elizaLogger5.debug("Borrow amount", borrowAmount.toFixed(4));
      elizaLogger5.debug("Borrow limits", this.borrowLimits);
      const assetRates = calculateCurrentRates2(tonAsset.config, tonAsset.data, this.masterConstants);
      const { borrowInterest, bRate, now, sRate, supplyInterest } = assetRates;
      const ONE = 10n ** 13n;
      const annualInterestRateReadable = Number(sRate) / Number(ONE);
      const dailyInterestRateReadable = annualInterestRateReadable / 365;
      const annualRateFP = sRate;
      const dailyRateFP = sRate / 365n;
      const principal = 10n * ONE;
      const dailyInterestFP = principal * dailyRateFP / ONE;
      elizaLogger5.debug("Borrow Interest", borrowInterest.toString());
      elizaLogger5.debug("Borrow Rate", bRate.toString());
      elizaLogger5.debug("Supply Interest", supplyInterest.toString());
      elizaLogger5.debug("Supply Rate", sRate.toString());
      elizaLogger5.debug("Now", now.toString());
      elizaLogger5.debug("Annual Interest Rate: ", annualInterestRateReadable.toString());
      elizaLogger5.debug("Daily Interest Rate:  ", dailyInterestRateReadable.toString());
      elizaLogger5.debug("Daily Interest (on 10 tokens):", formatFixedPoint(dailyInterestFP));
      const annualInterestRate = annualInterestRateReadable;
      const dailyInterestRate = dailyInterestRateReadable;
      const dailyInterest = formatFixedPoint(dailyInterestFP);
      const priceData = await this.collector.getPrices();
      const supplyMessage = this.evaa.createSupplyMessage({
        queryID: 0n,
        // we can set always to true, if we don't want to check user code version
        includeUserCode: true,
        amount: tonAsset.name === "TON" ? toNano2(params.amount) : convertToBigInt(Number(params.amount) * 1e6),
        userAddress: wallet.address,
        asset: tonAsset.asset,
        payload: Cell3.EMPTY,
        amountToTransfer: toNano2(0)
      });
      const signedSupplyMessage = wallet.createTransfer({
        seqno: await wallet.getSeqno(),
        secretKey: this.walletProvider.keypair.secretKey,
        messages: [
          internal4({
            to: this.evaa.address,
            value: toNano2(params.amount) + FEES2.SUPPLY,
            body: supplyMessage
          })
        ],
        sendMode: SendMode3.PAY_GAS_SEPARATELY,
        timeout: Math.floor(Date.now() / 1e3) + 60
      });
      await wallet.send(signedSupplyMessage);
      const externalSupplyMessage = beginCell3().store(
        storeMessage2(
          external2({
            to: wallet.address,
            body: signedSupplyMessage
          })
        )
      ).endCell();
      await this.evaa.getSync();
      await sleep(3e4);
      const txHash = externalSupplyMessage.hash().toString("hex");
      const explorerUrl = `${tonExplorerUrl}/transaction/${txHash}`;
      let amountToRepay = data.balances.get(tonAsset.asset.assetId).amount;
      elizaLogger5.debug("Amount to repay", amountToRepay.toString());
      return {
        txHash,
        explorerUrl,
        asset: tonAsset.name,
        amount: borrowAmount.toString(),
        amountToRepay: amountToRepay.toString(),
        dailyInterest,
        annualInterestRate
      };
    }
  }
};
var supplyAction = {
  name: "EVAA_SUPPLY",
  similes: [
    "LEND",
    "LEND_TON",
    "SUPPLY_TON",
    "DEPOSIT_TON",
    "LEND_USDT",
    "SUPPLY_USDT",
    "DEPOSIT_USDT",
    "LEND_USDC",
    "SUPPLY_USDC",
    "DEPOSIT_USDC",
    "LEND_TONCOIN",
    "SUPPLY_TONCOIN"
  ],
  description: "Supply/lend TON, USDT and USDC tokens to the EVAA lending protocol",
  validate: async (runtime) => {
    const walletProvider = await initWalletProvider(runtime);
    return !!walletProvider.getAddress();
  },
  handler: async (runtime, message, state, options, callback) => {
    elizaLogger5.info("Starting SUPPLY EVAA handler");
    try {
      const supplyContext = composeContext5({
        state,
        template: lendTemplate
      });
      const content = await generateObject5({
        runtime,
        context: supplyContext,
        schema: supplySchema,
        modelClass: ModelClass5.LARGE
      });
      const supplyDetails = content.object;
      elizaLogger5.debug(`Supply details: ${JSON.stringify(content.object)}`);
      if (!isSupplyContent(supplyDetails)) {
        throw new Error("Invalid supplying parameters");
      }
      const walletProvider = await initWalletProvider(runtime);
      const action = new SupplyAction(walletProvider);
      const supplyResult = await action.supply(supplyDetails, runtime, callback);
      if (callback) {
        let responseText = `Successfully initiated supplying of ${supplyDetails.amount} ${supplyResult.asset}.`;
        if (supplyDetails.showInterest) {
          const formattedDailyInterest = Number(supplyResult.dailyInterest).toFixed(4);
          const formattedAnnualRate = (Number(supplyResult.annualInterestRate) * 100).toFixed(2);
          responseText += `

Estimated Interest:
- Daily Interest: ${formattedDailyInterest} ${supplyResult.asset}
- Annual Interest Rate: ${formattedAnnualRate}%`;
        }
        responseText += `

Track the transaction here: ${supplyResult.explorerUrl}`;
        callback({
          text: responseText,
          metadata: {
            txHash: supplyResult.txHash,
            explorerUrl: supplyResult.explorerUrl,
            asset: supplyResult.asset,
            amount: supplyDetails.amount,
            amountToRepay: supplyResult.amountToRepay,
            dailyInterest: supplyResult.dailyInterest.toString(),
            annualInterestRate: supplyResult.annualInterestRate.toString(),
            action: "SUPPLY"
          }
        });
      }
      return true;
    } catch (error) {
      elizaLogger5.error("Error in LEND_TON handler:", error);
      if (callback) {
        callback({
          text: `Failed to lend TON: ${error.message}`,
          error: true
        });
      }
      return false;
    }
  },
  examples: [
    [
      {
        user: "{{user1}}",
        content: {
          text: "I want to supply 1 TON to the EVAA protocol"
        }
      },
      {
        user: "{{agentName}}",
        content: {
          text: "I'll help you supply 1 TON to the EVAA protocol. Processing your request...",
          action: "SUPPLY"
        }
      }
    ],
    [
      {
        user: "{{user1}}",
        content: {
          text: "Can you lend 0.5 TON to EVAA with user code included?"
        }
      },
      {
        user: "{{agentName}}",
        content: {
          text: "I'll help you lend 0.5 TON to EVAA with user code included. Processing your request...",
          action: "LEND"
        }
      }
    ]
  ]
};
var evaaSupply_default = supplyAction;

// src/actions/evaaWithdraw.ts
import {
  elizaLogger as elizaLogger6,
  ModelClass as ModelClass6,
  generateObject as generateObject6,
  composeContext as composeContext6
} from "@elizaos/core";
import BigNumber4 from "bignumber.js";
import evaaPkg3 from "@evaafi/sdk";
import { Cell as Cell4, toNano as toNano3, beginCell as beginCell4, storeMessage as storeMessage3, internal as internal5, external as external3, SendMode as SendMode4 } from "@ton/ton";
var {
  Evaa: Evaa3,
  FEES: FEES3,
  TON_TESTNET: TON_TESTNET3,
  TESTNET_POOL_CONFIG: TESTNET_POOL_CONFIG3,
  JUSDC_TESTNET: JUSDC_TESTNET3,
  JUSDT_TESTNET: JUSDT_TESTNET3,
  UserDataActive: UserDataActive3,
  AssetData: AssetData3,
  BalanceChangeType: BalanceChangeType3,
  calculatePresentValue: calculatePresentValue3,
  calculateCurrentRates: calculateCurrentRates3,
  MasterConstants: MasterConstants3,
  AssetConfig: AssetConfig3,
  ExtendedAssetData: ExtendedAssetData3,
  PoolAssetConfig: PoolAssetConfig3,
  mulFactor: mulFactor3,
  predictAPY: predictAPY3,
  PricesCollector: PricesCollector3
} = evaaPkg3;
var withdrawSchema = z.object({
  amount: z.string(),
  asset: z.string().nullable().optional().transform((val) => val === null ? "TON" : val),
  includeUserCode: z.boolean().nullable().optional().transform((val) => val === null ? false : val),
  showInterest: z.boolean().nullable().optional().transform((val) => val === null ? false : val)
});
function isWithdrawContent(content) {
  return (typeof content.amount === "string" || typeof content.amount === "number") && (content.asset === void 0 || typeof content.asset === "string") && (content.includeUserCode === void 0 || typeof content.includeUserCode === "boolean") && (content.showInterest === void 0 || typeof content.showInterest === "boolean");
}
var withdrawTemplate = `Respond with a JSON markdown block containing only the extracted values. Use null for any values that cannot be determined.

Example response:
\`\`\`json
{
    "amount": "1",
    "asset": "USDT" | "USDC" | "TON",
    "includeUserCode": true,
    "showInterest": true
}
\`\`\`

{{recentMessages}}

Given the recent messages, extract the following information about the requested withdrawal operation:
- Amount to withdraw
- Asset to withdraw
- Whether to include user code (optional)
- Whether to show interest calculation (optional)
- Make sure to remove \`\`\`json and \`\`\` from the response

Respond with a JSON markdown block containing only the extracted values.`;
var WithdrawAction = class {
  walletProvider;
  evaa;
  assetsData;
  assetsConfig;
  masterConstants;
  USDT;
  USDC;
  TON;
  totalSupply;
  totalBorrow;
  collector;
  borrowInterest;
  predictAPY;
  withdrawalLimits;
  borrowLimits;
  constructor(walletProvider) {
    this.walletProvider = walletProvider;
    this.evaa = null;
    this.assetsData = null;
    this.assetsConfig = null;
    this.masterConstants = null;
    this.USDT = null;
    this.USDC = null;
    this.TON = null;
    this.totalSupply = null;
    this.totalBorrow = null;
    this.borrowInterest = null;
    this.predictAPY = null;
    this.collector = null;
    this.withdrawalLimits = null;
    this.borrowLimits = null;
  }
  async waitForPrincipalChange(addr, asset, func, currentEvaa = this.evaa, currentClient = this.walletProvider.getWalletClient()) {
    let prevPrincipal = 0n;
    let user = currentClient.open(await currentEvaa.openUserContract(addr));
    await user.getSync(currentEvaa.data.assetsData, currentEvaa.data.assetsConfig, (await this.collector.getPrices()).dict);
    if (user.data?.type == "active") {
      prevPrincipal = user.data.principals.get(asset.assetId) ?? 0n;
    }
    await new Promise((resolve) => setTimeout(resolve, 1e3));
    await func();
    while (true) {
      user = currentClient.open(await currentEvaa.openUserContract(addr));
      await user.getSync(currentEvaa.data.assetsData, currentEvaa.data.assetsConfig, (await this.collector.getPrices()).dict);
      if (user.data?.type == "active") {
        const principalNow = user.data.principals.get(asset.assetId) ?? 0n;
        if (Math.abs(Number(principalNow - prevPrincipal)) > 10) {
          return { principal: principalNow, data: user.data };
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 4e3));
    }
  }
  async withdraw(params, runtime, callback) {
    const walletClient = this.walletProvider.getWalletClient();
    const wallet = walletClient.open(this.walletProvider.wallet);
    const tonExplorerUrl = runtime.getSetting("TON_EXPLORER_URL") || "https://testnet.tonviewer.com/";
    this.evaa = walletClient.open(
      new Evaa3({ poolConfig: TESTNET_POOL_CONFIG3 })
    );
    await this.evaa.getSync();
    this.assetsData = this.evaa.data?.assetsData;
    this.assetsConfig = this.evaa.data?.assetsConfig;
    this.masterConstants = this.evaa.poolConfig.masterConstants;
    this.USDT = {
      name: "USDT",
      data: this.assetsData.get(JUSDT_TESTNET3.assetId),
      config: this.assetsConfig.get(JUSDT_TESTNET3.assetId),
      asset: JUSDT_TESTNET3
    };
    this.USDC = {
      name: "USDC",
      data: this.assetsData.get(JUSDC_TESTNET3.assetId),
      config: this.assetsConfig.get(JUSDC_TESTNET3.assetId),
      asset: JUSDC_TESTNET3
    };
    this.TON = {
      name: "TON",
      data: this.assetsData.get(TON_TESTNET3.assetId),
      config: this.assetsConfig.get(TON_TESTNET3.assetId),
      asset: TON_TESTNET3
    };
    this.totalSupply = calculatePresentValue3(this.TON.data.sRate, this.TON.data.totalSupply, this.masterConstants);
    this.totalBorrow = calculatePresentValue3(this.TON.data.bRate, this.TON.data.totalBorrow, this.masterConstants);
    this.borrowInterest = this.TON.config.baseBorrowRate + mulFactor3(this.masterConstants.FACTOR_SCALE, this.TON.config.borrowRateSlopeLow, this.TON.config.targetUtilization) + mulFactor3(
      this.masterConstants.FACTOR_SCALE,
      this.TON.config.borrowRateSlopeHigh,
      this.masterConstants.FACTOR_SCALE - this.TON.config.targetUtilization
    );
    this.predictAPY = predictAPY3({
      amount: this.totalBorrow,
      balanceChangeType: BalanceChangeType3.Repay,
      assetData: this.TON.data,
      assetConfig: this.TON.config,
      masterConstants: this.masterConstants
    });
    this.collector = new PricesCollector3(TESTNET_POOL_CONFIG3);
    const borrower = walletClient.open(this.evaa.openUserContract(wallet.address));
    await borrower.getSync(this.evaa.data.assetsData, this.evaa.data.assetsConfig, (await this.collector.getPrices()).dict, true);
    const data = borrower.data;
    elizaLogger6.log("User data:", data.fullyParsed);
    if (borrower.data?.type != "active") {
      elizaLogger6.log("Borrower User is inactive");
      if (callback) {
        callback({
          text: `You need provide collateral funds before you can borrow`,
          content: { error: "No collateral funds provided." }
        });
        return false;
      }
    } else {
      let formatFixedPoint = function(x, decimals = 13) {
        const factor = 10 ** decimals;
        return (Number(x) / factor).toFixed(6);
      };
      this.withdrawalLimits = borrower.data.withdrawalLimits;
      this.borrowLimits = borrower.data.borrowLimits;
      elizaLogger6.debug("User principals");
      elizaLogger6.debug("Real Principals", borrower.data.realPrincipals);
      elizaLogger6.debug("User Principal", borrower.data.principals);
      elizaLogger6.debug("Get Prices For Withdraw [USDT]", (await this.collector.getPricesForWithdraw(borrower.data.realPrincipals, JUSDT_TESTNET3)).dict);
      elizaLogger6.debug("Get Prices For Withdraw [USDC]", (await this.collector.getPricesForWithdraw(borrower.data.realPrincipals, JUSDC_TESTNET3)).dict);
      let amoundToRepayTON = data.balances.get(TON_TESTNET3.assetId).amount;
      elizaLogger6.debug("Amount to repay [TON]", new BigNumber4(amoundToRepayTON).toFixed(4));
      let amoundToRepayUSDT = data.balances.get(JUSDT_TESTNET3.assetId).amount;
      elizaLogger6.debug("Amount to repay [USDT]", new BigNumber4(amoundToRepayUSDT).toFixed(2));
      let amoundToRepayUSDC = data.balances.get(JUSDC_TESTNET3.assetId).amount;
      elizaLogger6.debug("Amount to repay [USDC]", new BigNumber4(amoundToRepayUSDC).toFixed(2));
      const borrowAmount = typeof params.amount !== "string" ? new BigNumber4(String(params.amount)) : new BigNumber4(params.amount);
      const tonAsset = params.asset === "TON" ? this.TON : params.asset === "USDT" ? this.USDT : params.asset === "USDC" ? this.USDC : this.TON;
      if (!tonAsset) {
        throw new Error("TON asset not found in master data");
      }
      elizaLogger6.debug("Borrow amount", borrowAmount.toFixed(4));
      elizaLogger6.debug("Borrow limits", this.borrowLimits);
      const assetRates = calculateCurrentRates3(tonAsset.config, tonAsset.data, this.masterConstants);
      const { borrowInterest, bRate, now, sRate, supplyInterest } = assetRates;
      const ONE = 10n ** 13n;
      const annualInterestRateReadable = Number(sRate) / Number(ONE);
      const dailyInterestRateReadable = annualInterestRateReadable / 365;
      const annualRateFP = sRate;
      const dailyRateFP = sRate / 365n;
      const principal = 10n * ONE;
      const dailyInterestFP = principal * dailyRateFP / ONE;
      elizaLogger6.debug("Borrow Interest", borrowInterest.toString());
      elizaLogger6.debug("Borrow Rate", bRate.toString());
      elizaLogger6.debug("Supply Interest", supplyInterest.toString());
      elizaLogger6.debug("Supply Rate", sRate.toString());
      elizaLogger6.debug("Now", now.toString());
      elizaLogger6.debug("Annual Interest Rate: ", annualInterestRateReadable.toString());
      elizaLogger6.debug("Daily Interest Rate:  ", dailyInterestRateReadable.toString());
      elizaLogger6.debug("Daily Interest (on 10 tokens):", formatFixedPoint(dailyInterestFP));
      const annualInterestRate = annualInterestRateReadable;
      const dailyInterestRate = dailyInterestRateReadable;
      const dailyInterest = formatFixedPoint(dailyInterestFP);
      const priceData = await this.collector.getPrices();
      const withdrawMessage = this.evaa.createWithdrawMessage({
        queryID: 0n,
        // we can set always to true, if we don't want to check user code version
        includeUserCode: true,
        amount: tonAsset.name === "TON" ? toNano3(params.amount) : convertToBigInt(Number(params.amount) * 1e6),
        //0xFFFFFFFFFFFFFFFFn,
        userAddress: wallet.address,
        asset: tonAsset.asset,
        payload: Cell4.EMPTY,
        priceData: priceData.dataCell,
        amountToTransfer: toNano3(0)
      });
      const signedMessage = wallet.createTransfer({
        seqno: await wallet.getSeqno(),
        secretKey: this.walletProvider.keypair.secretKey,
        messages: [
          internal5({
            to: this.evaa.address,
            value: toNano3(1) + FEES3.WITHDRAW,
            body: withdrawMessage
          })
        ],
        sendMode: SendMode4.PAY_GAS_SEPARATELY,
        timeout: Math.floor(Date.now() / 1e3) + 60
      });
      await wallet.send(signedMessage);
      const externalMessage = beginCell4().store(
        storeMessage3(
          external3({
            to: wallet.address,
            body: signedMessage
          })
        )
      ).endCell();
      await this.evaa.getSync();
      await sleep(3e4);
      const txHash = externalMessage.hash().toString("hex");
      const explorerUrl = `${tonExplorerUrl}/transaction/${txHash}`;
      let amountToRepay = data.balances.get(tonAsset.asset.assetId).amount;
      elizaLogger6.debug("Amount to repay", amountToRepay.toString());
      return {
        txHash,
        explorerUrl,
        asset: tonAsset.name,
        amount: borrowAmount.toString(),
        amountToRepay: amountToRepay.toString(),
        dailyInterest,
        annualInterestRate
      };
    }
  }
};
var withdrawAction = {
  name: "EVAA_WITHDRAW",
  similes: [
    "WITHDRAW_TON",
    "WITHDRAW_USDT",
    "WITHDRAW_USDC",
    "REDEEM_TON",
    "REMOVE_TON",
    "WITHDRAW_TONCOIN",
    "REDEEM_TONCOIN"
  ],
  description: "Withdraw TON tokens from the EVAA lending protocol",
  validate: async (runtime) => {
    const walletProvider = await initWalletProvider(runtime);
    return !!walletProvider.getAddress();
  },
  handler: async (runtime, message, state, options, callback) => {
    elizaLogger6.info("Starting WITHDRAW FROM EVAA handler");
    try {
      const withdrawContext = composeContext6({
        state,
        template: withdrawTemplate
      });
      const content = await generateObject6({
        runtime,
        context: withdrawContext,
        schema: withdrawSchema,
        modelClass: ModelClass6.LARGE
      });
      const withdrawDetails = content.object;
      elizaLogger6.debug(`Withdraw details: ${JSON.stringify(content.object)}`);
      if (!isWithdrawContent(withdrawDetails)) {
        throw new Error("Invalid withdrawing parameters");
      }
      const walletProvider = await initWalletProvider(runtime);
      const action = new WithdrawAction(walletProvider);
      const withdrawResult = await action.withdraw(withdrawDetails, runtime, callback);
      if (callback) {
        let responseText = `Successfully initiated withdrawing of ${withdrawDetails.amount} ${withdrawResult.asset}.`;
        if (withdrawDetails.showInterest) {
          const formattedDailyInterest = Number(withdrawResult.dailyInterest).toFixed(4);
          const formattedAnnualRate = (Number(withdrawResult.annualInterestRate) * 100).toFixed(2);
          responseText += `

Amount to Repay: ${Number(withdrawResult.amountToRepay).toFixed(4)} ${withdrawResult.asset}

Estimated Interest:
- Daily Interest: ${formattedDailyInterest} ${withdrawResult.asset}
- Annual Interest Rate: ${formattedAnnualRate}%`;
        }
        responseText += `

Track the transaction here: ${withdrawResult.explorerUrl}`;
        callback({
          text: responseText,
          metadata: {
            txHash: withdrawResult.txHash,
            explorerUrl: withdrawResult.explorerUrl,
            asset: withdrawResult.asset,
            amount: withdrawDetails.amount,
            amountToRepay: withdrawResult.amountToRepay,
            dailyInterest: withdrawResult.dailyInterest.toString(),
            annualInterestRate: withdrawResult.annualInterestRate.toString(),
            action: "WITHDRAW"
          }
        });
      }
      return true;
    } catch (error) {
      elizaLogger6.error("Error in WITHDRAW_TON handler:", error);
      if (callback) {
        callback({
          text: `Failed to withdraw TON: ${error.message}`,
          error: true
        });
      }
      return false;
    }
  },
  examples: [
    [
      {
        user: "{{user1}}",
        content: {
          text: "I want to withdraw 1 TON from the EVAA protocol"
        }
      },
      {
        user: "{{agentName}}",
        content: {
          text: "I'll help you withdraw 1 TON from the EVAA protocol. Processing your request...",
          action: "WITHDRAW_TON"
        }
      }
    ],
    [
      {
        user: "{{user1}}",
        content: {
          text: "Can you withdraw 0.5 TON from EVAA with user code included?"
        }
      },
      {
        user: "{{agentName}}",
        content: {
          text: "I'll help you withdraw 0.5 TON from EVAA with user code included. Processing your request...",
          action: "WITHDRAW_TON"
        }
      }
    ]
  ]
};
var evaaWithdraw_default = withdrawAction;

// src/actions/evaaRepay.ts
import {
  elizaLogger as elizaLogger7,
  ModelClass as ModelClass7,
  generateObject as generateObject7,
  composeContext as composeContext7
} from "@elizaos/core";
import BigNumber5 from "bignumber.js";
import evaaPkg4 from "@evaafi/sdk";
import { Cell as Cell5, toNano as toNano4, beginCell as beginCell5, storeMessage as storeMessage4, internal as internal6, external as external4, SendMode as SendMode5 } from "@ton/ton";
var {
  Evaa: Evaa4,
  FEES: FEES4,
  TON_TESTNET: TON_TESTNET4,
  TESTNET_POOL_CONFIG: TESTNET_POOL_CONFIG4,
  JUSDC_TESTNET: JUSDC_TESTNET4,
  JUSDT_TESTNET: JUSDT_TESTNET4,
  UserDataActive: UserDataActive4,
  AssetData: AssetData4,
  BalanceChangeType: BalanceChangeType4,
  calculatePresentValue: calculatePresentValue4,
  calculateCurrentRates: calculateCurrentRates4,
  MasterConstants: MasterConstants4,
  AssetConfig: AssetConfig4,
  ExtendedAssetData: ExtendedAssetData4,
  PoolAssetConfig: PoolAssetConfig4,
  mulFactor: mulFactor4,
  predictAPY: predictAPY4,
  PricesCollector: PricesCollector4
} = evaaPkg4;
var repaySchema = z.object({
  asset: z.string().nullable().optional().transform((val) => val === null ? "TON" : val),
  includeUserCode: z.boolean().nullable().optional().transform((val) => val === null ? false : val)
});
function isRepayContent(content) {
  return (typeof content.asset === void 0 || typeof content.asset === "string") && (content.includeUserCode === void 0 || typeof content.includeUserCode === "boolean");
}
var repayTemplate = `Respond with a JSON markdown block containing only the extracted values. Use null for any values that cannot be determined.

Example response:
\`\`\`json
{
    "asset": "USDT" | "USDC" | "TON",
    "includeUserCode": true
}
\`\`\`

{{recentMessages}}

Given the recent messages, extract the following information about the requested total repayment operation:
- Asset to repay
- Whether to include user code (optional)
- Make sure to remove \`\`\`json and \`\`\` from the response

Respond with a JSON markdown block containing only the extracted values.`;
var RepayAction = class {
  walletProvider;
  evaa;
  assetsData;
  assetsConfig;
  masterConstants;
  USDT;
  USDC;
  TON;
  totalSupply;
  totalBorrow;
  collector;
  borrowInterest;
  predictAPY;
  withdrawalLimits;
  borrowLimits;
  constructor(walletProvider) {
    this.walletProvider = walletProvider;
    this.evaa = null;
    this.assetsData = null;
    this.assetsConfig = null;
    this.masterConstants = null;
    this.USDT = null;
    this.USDC = null;
    this.TON = null;
    this.totalSupply = null;
    this.totalBorrow = null;
    this.borrowInterest = null;
    this.predictAPY = null;
    this.collector = null;
    this.withdrawalLimits = null;
    this.borrowLimits = null;
  }
  async waitForPrincipalChange(addr, asset, func, currentEvaa = this.evaa, currentClient = this.walletProvider.getWalletClient()) {
    let prevPrincipal = 0n;
    let user = currentClient.open(await currentEvaa.openUserContract(addr));
    await user.getSync(currentEvaa.data.assetsData, currentEvaa.data.assetsConfig, (await this.collector.getPrices()).dict);
    if (user.data?.type == "active") {
      prevPrincipal = user.data.principals.get(asset.assetId) ?? 0n;
    }
    await new Promise((resolve) => setTimeout(resolve, 1e3));
    await func();
    while (true) {
      user = currentClient.open(await currentEvaa.openUserContract(addr));
      await user.getSync(currentEvaa.data.assetsData, currentEvaa.data.assetsConfig, (await this.collector.getPrices()).dict);
      if (user.data?.type == "active") {
        const principalNow = user.data.principals.get(asset.assetId) ?? 0n;
        if (Math.abs(Number(principalNow - prevPrincipal)) > 10) {
          return { principal: principalNow, data: user.data };
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 4e3));
    }
  }
  async repay(params, runtime, callback) {
    const walletClient = this.walletProvider.getWalletClient();
    const wallet = walletClient.open(this.walletProvider.wallet);
    const tonExplorerUrl = runtime.getSetting("TON_EXPLORER_URL") || "https://testnet.tonviewer.com/";
    this.evaa = walletClient.open(
      new Evaa4({ poolConfig: TESTNET_POOL_CONFIG4 })
    );
    await this.evaa.getSync();
    this.assetsData = this.evaa.data?.assetsData;
    this.assetsConfig = this.evaa.data?.assetsConfig;
    this.masterConstants = this.evaa.poolConfig.masterConstants;
    this.USDT = {
      name: "USDT",
      data: this.assetsData.get(JUSDT_TESTNET4.assetId),
      config: this.assetsConfig.get(JUSDT_TESTNET4.assetId),
      asset: JUSDT_TESTNET4
    };
    this.USDC = {
      name: "USDC",
      data: this.assetsData.get(JUSDC_TESTNET4.assetId),
      config: this.assetsConfig.get(JUSDC_TESTNET4.assetId),
      asset: JUSDC_TESTNET4
    };
    this.TON = {
      name: "TON",
      data: this.assetsData.get(TON_TESTNET4.assetId),
      config: this.assetsConfig.get(TON_TESTNET4.assetId),
      asset: TON_TESTNET4
    };
    this.totalSupply = calculatePresentValue4(this.TON.data.sRate, this.TON.data.totalSupply, this.masterConstants);
    this.totalBorrow = calculatePresentValue4(this.TON.data.bRate, this.TON.data.totalBorrow, this.masterConstants);
    this.borrowInterest = this.TON.config.baseBorrowRate + mulFactor4(this.masterConstants.FACTOR_SCALE, this.TON.config.borrowRateSlopeLow, this.TON.config.targetUtilization) + mulFactor4(
      this.masterConstants.FACTOR_SCALE,
      this.TON.config.borrowRateSlopeHigh,
      this.masterConstants.FACTOR_SCALE - this.TON.config.targetUtilization
    );
    this.predictAPY = predictAPY4({
      amount: this.totalBorrow,
      balanceChangeType: BalanceChangeType4.Repay,
      assetData: this.TON.data,
      assetConfig: this.TON.config,
      masterConstants: this.masterConstants
    });
    this.collector = new PricesCollector4(TESTNET_POOL_CONFIG4);
    const borrower = walletClient.open(this.evaa.openUserContract(wallet.address));
    await borrower.getSync(this.evaa.data.assetsData, this.evaa.data.assetsConfig, (await this.collector.getPrices()).dict, true);
    const data = borrower.data;
    elizaLogger7.log("User data:", data.fullyParsed);
    if (borrower.data?.type != "active") {
      elizaLogger7.log("Borrower User is inactive");
      if (callback) {
        callback({
          text: `You need provide collateral funds before you can borrow`,
          content: { error: "No collateral funds provided." }
        });
        return false;
      }
    } else {
      let formatFixedPoint = function(x, decimals = 13) {
        const factor = 10 ** decimals;
        return (Number(x) / factor).toFixed(6);
      };
      this.withdrawalLimits = borrower.data.withdrawalLimits;
      this.borrowLimits = borrower.data.borrowLimits;
      elizaLogger7.debug("User principals");
      elizaLogger7.debug("Real Principals", borrower.data.realPrincipals);
      elizaLogger7.debug("User Principal", borrower.data.principals);
      elizaLogger7.debug("Get Prices For Withdraw [USDT]", (await this.collector.getPricesForWithdraw(borrower.data.realPrincipals, JUSDT_TESTNET4)).dict);
      elizaLogger7.debug("Get Prices For Withdraw [USDC]", (await this.collector.getPricesForWithdraw(borrower.data.realPrincipals, JUSDC_TESTNET4)).dict);
      let amoundToRepayTON = data.balances.get(TON_TESTNET4.assetId).amount;
      elizaLogger7.debug("Amount to repay [TON]", new BigNumber5(amoundToRepayTON).toFixed(4));
      let amoundToRepayUSDT = data.balances.get(JUSDT_TESTNET4.assetId).amount;
      elizaLogger7.debug("Amount to repay [USDT]", new BigNumber5(amoundToRepayUSDT).toFixed(2));
      let amoundToRepayUSDC = data.balances.get(JUSDC_TESTNET4.assetId).amount;
      elizaLogger7.debug("Amount to repay [USDC]", new BigNumber5(amoundToRepayUSDC).toFixed(2));
      const tonAsset = params.asset === "TON" ? this.TON : params.asset === "USDT" ? this.USDT : params.asset === "USDC" ? this.USDC : this.TON;
      if (!tonAsset) {
        throw new Error("TON asset not found in master data");
      }
      const amountToRepayToEvaa = data.balances.get(tonAsset.asset.assetId).amount;
      const borrowAmount = typeof amountToRepayToEvaa !== "string" ? new BigNumber5(String(amountToRepayToEvaa)) : new BigNumber5(amountToRepayToEvaa);
      elizaLogger7.debug("Borrow amount", borrowAmount.toFixed(4));
      elizaLogger7.debug("Borrow limits", this.borrowLimits);
      const assetRates = calculateCurrentRates4(tonAsset.config, tonAsset.data, this.masterConstants);
      const { borrowInterest, bRate, now, sRate, supplyInterest } = assetRates;
      const ONE = 10n ** 13n;
      const annualInterestRateReadable = Number(sRate) / Number(ONE);
      const dailyInterestRateReadable = annualInterestRateReadable / 365;
      const annualRateFP = sRate;
      const dailyRateFP = sRate / 365n;
      const principal = 10n * ONE;
      const dailyInterestFP = principal * dailyRateFP / ONE;
      elizaLogger7.debug("Borrow Interest", borrowInterest.toString());
      elizaLogger7.debug("Borrow Rate", bRate.toString());
      elizaLogger7.debug("Supply Interest", supplyInterest.toString());
      elizaLogger7.debug("Supply Rate", sRate.toString());
      elizaLogger7.debug("Now", now.toString());
      elizaLogger7.debug("Annual Interest Rate: ", annualInterestRateReadable.toString());
      elizaLogger7.debug("Daily Interest Rate:  ", dailyInterestRateReadable.toString());
      elizaLogger7.debug("Daily Interest (on 10 tokens):", formatFixedPoint(dailyInterestFP));
      const annualInterestRate = annualInterestRateReadable;
      const dailyInterestRate = dailyInterestRateReadable;
      const dailyInterest = formatFixedPoint(dailyInterestFP);
      const priceData = await this.collector.getPrices();
      const supplyMessage = this.evaa.createSupplyMessage({
        queryID: 0n,
        // we can set always to true, if we don't want to check user code version
        includeUserCode: true,
        amount: tonAsset.name === "TON" ? toNano4(amountToRepayToEvaa) : convertToBigInt(Number(amountToRepayToEvaa) * 1e6),
        userAddress: wallet.address,
        asset: tonAsset.asset,
        payload: Cell5.EMPTY,
        amountToTransfer: toNano4(0)
      });
      const signedSupplyMessage = wallet.createTransfer({
        seqno: await wallet.getSeqno(),
        secretKey: this.walletProvider.keypair.secretKey,
        messages: [
          internal6({
            to: this.evaa.address,
            value: toNano4(1) + FEES4.SUPPLY,
            body: supplyMessage
          })
        ],
        sendMode: SendMode5.PAY_GAS_SEPARATELY,
        timeout: Math.floor(Date.now() / 1e3) + 60
      });
      await wallet.send(signedSupplyMessage);
      const externalSupplyMessage = beginCell5().store(
        storeMessage4(
          external4({
            to: wallet.address,
            body: signedSupplyMessage
          })
        )
      ).endCell();
      await this.evaa.getSync();
      await sleep(3e4);
      const txHash = externalSupplyMessage.hash().toString("hex");
      const explorerUrl = `${tonExplorerUrl}/transaction/${txHash}`;
      let amountToRepay = data.balances.get(tonAsset.asset.assetId).amount;
      elizaLogger7.debug("Amount to repay", amountToRepay.toString());
      return {
        txHash,
        explorerUrl,
        asset: tonAsset.name,
        amount: borrowAmount.toString(),
        amountToRepay: amountToRepay.toString(),
        dailyInterest,
        annualInterestRate
      };
    }
  }
};
var repayAction = {
  name: "EVAA_REPAY",
  similes: [
    "REPAY_USDT",
    "REPAY_USDC",
    "REPAY_TON",
    "REPAY_ALL_TON",
    "REPAY_FULL_TON",
    "REPAY_TOTAL_TONCOIN",
    "REPAY_ALL_TONCOIN"
  ],
  description: "Repay all repayed TON tokens to the EVAA lending protocol",
  validate: async (runtime) => {
    const walletProvider = await initWalletProvider(runtime);
    return !!walletProvider.getAddress();
  },
  handler: async (runtime, message, state, options, callback) => {
    elizaLogger7.info("Starting REPAY EVAA handler");
    try {
      const repayContext = composeContext7({
        state,
        template: repayTemplate
      });
      const content = await generateObject7({
        runtime,
        context: repayContext,
        schema: repaySchema,
        modelClass: ModelClass7.LARGE
      });
      const repayDetails = content.object;
      elizaLogger7.debug(`Repay details: ${JSON.stringify(content.object)}`);
      if (!isRepayContent(repayDetails)) {
        throw new Error("Invalid repaying parameters");
      }
      const walletProvider = await initWalletProvider(runtime);
      const action = new RepayAction(walletProvider);
      const repayResult = await action.repay(repayDetails, runtime, callback);
      if (callback) {
        let responseText = `Successfully initiated repaying of ${repayResult.amountToRepay} ${repayResult.asset}.`;
        responseText += `

Amount Repaid: ${Number(repayResult.amountToRepay).toFixed(4)} ${repayResult.asset}

Track the transaction here: ${repayResult.explorerUrl}`;
        callback({
          text: responseText,
          metadata: {
            txHash: repayResult.txHash,
            explorerUrl: repayResult.explorerUrl,
            asset: repayResult.asset,
            amountToRepay: repayResult.amountToRepay,
            action: "REPAY"
          }
        });
      }
      return true;
    } catch (error) {
      elizaLogger7.error("Error in REPAY EVAA handler:", error);
      if (callback) {
        callback({
          text: `Failed to repay EVAA loan: ${error.message}`,
          error: true
        });
      }
      return false;
    }
  },
  examples: [
    [
      {
        user: "{{user1}}",
        content: {
          text: "I want to repay my entire TON loan to the EVAA protocol"
        }
      },
      {
        user: "{{agentName}}",
        content: {
          text: "I'll help you repay your entire TON loan to the EVAA protocol. Processing your request...",
          action: "REPAY"
        }
      }
    ],
    [
      {
        user: "{{user1}}",
        content: {
          text: "Can you help me fully repay my EVAA TON loan with user code included?"
        }
      },
      {
        user: "{{agentName}}",
        content: {
          text: "I'll help you fully repay your EVAA TON loan with user code included. Processing your request...",
          action: "REPAY"
        }
      }
    ]
  ]
};
var evaaRepay_default = repayAction;

// src/actions/evaaPositions.ts
import {
  elizaLogger as elizaLogger8,
  generateObject as generateObject8,
  composeContext as composeContext8,
  ModelClass as ModelClass8
} from "@elizaos/core";
import { fromNano } from "@ton/ton";
import evaaPkg5 from "@evaafi/sdk";
var {
  Evaa: Evaa5,
  FEES: FEES5,
  TON_TESTNET: TON_TESTNET5,
  TESTNET_POOL_CONFIG: TESTNET_POOL_CONFIG5,
  JUSDC_TESTNET: JUSDC_TESTNET5,
  JUSDT_TESTNET: JUSDT_TESTNET5,
  UserDataActive: UserDataActive5,
  AssetData: AssetData5,
  BalanceChangeType: BalanceChangeType5,
  calculatePresentValue: calculatePresentValue5,
  calculateCurrentRates: calculateCurrentRates5,
  MasterConstants: MasterConstants5,
  AssetConfig: AssetConfig5,
  ExtendedAssetData: ExtendedAssetData5,
  PoolAssetConfig: PoolAssetConfig5,
  mulFactor: mulFactor5,
  predictAPY: predictAPY5,
  PricesCollector: PricesCollector5
} = evaaPkg5;
var positionItemSchema = z.object({
  assetId: z.string().nullable(),
  principal: z.string().nullable().optional(),
  borrowInterest: z.string().nullable().optional(),
  borrowRate: z.string().nullable().optional(),
  supplyInterest: z.string().nullable().optional(),
  supplyRate: z.string().nullable().optional(),
  annualInterestRate: z.string().nullable().optional(),
  dailyInterestRate: z.string().nullable().optional(),
  dailyInterest: z.string().nullable().optional(),
  //accruedInterest: z.string().nullable().optional(),
  healthFactor: z.number().nullable().optional(),
  liquidationThreshold: z.number().nullable().optional()
});
var positionsSchema = z.object({
  positions: z.array(positionItemSchema)
});
function isPositionItemContent(content) {
  return (content.assetId === null || typeof content.assetId === "string") && (content.principal === null || typeof content.principal === "string" || content.principal === void 0) && (content.borrowInterest === null || typeof content.borrowInterest === "string" || content.borrowInterest === void 0) && (content.borrowRate === null || typeof content.borrowRate === "string" || content.borrowRate === void 0) && (content.supplyInterest === null || typeof content.supplyInterest === "string" || content.supplyInterest === void 0) && (content.supplyRate === null || typeof content.supplyRate === "string" || content.supplyRate === void 0) && (content.annualInterestRate === null || typeof content.annualInterestRate === "string" || content.annualInterestRate === void 0) && (content.dailyInterestRate === null || typeof content.dailyInterestRate === "string" || content.dailyInterestRate === void 0) && (content.dailyInterest === null || typeof content.dailyInterest === "string" || content.dailyInterest === void 0) && //(content.accruedInterest === null || typeof content.accruedInterest === "string" || content.accruedInterest === undefined) &&
  (content.healthFactor === null || typeof content.healthFactor === "number" || content.healthFactor === void 0) && (content.liquidationThreshold === null || typeof content.liquidationThreshold === "number" || content.liquidationThreshold === void 0);
}
function isPositionsContent(content) {
  return Array.isArray(content.positions) && content.positions.every((item) => isPositionItemContent(item));
}
var positionsTemplate = `Respond with a JSON markdown block containing only the extracted values. Use null for any values that cannot be determined.

Example response:
\`\`\`json
{
    "positions": [
        {
            "assetId": "TON",
            "principal": "0",
            "borrowInterest": "0",
            "borrowRate": "0",
            "supplyInterest": "0",
            "supplyRate": "0",
            "annualInterestRate": "0",
            "dailyInterestRate": "0",
            "dailyInterest": "0",
            "healthFactor": 0,
            "liquidationThreshold": 0
        },
        {
            "assetId": "USDT",
            "principal": "0",
            "borrowInterest": "0",
            "borrowRate": "0",
            "supplyInterest": "0",
            "supplyRate": "0",
            "annualInterestRate": "0",
            "dailyInterestRate": "0",
            "dailyInterest": "0",
            "healthFactor": 0,
            "liquidationThreshold": 0
        },
        {
            "assetId": "USDC",
            "principal": "0",
            "borrowInterest": "0",
            "borrowRate": "0",
            "supplyInterest": "0",
            "supplyRate": "0",
            "annualInterestRate": "0",
            "dailyInterestRate": "0",
            "dailyInterest": "0",
            "healthFactor": 0,
            "liquidationThreshold": 0
        }
    ]
}
\`\`\`

{{recentMessages}}

Given the recent messages, extract the following information about the borrowed positions:
- Asset ID (TON, USDT, USDC, etc.)
- Principal amount borrowed (if mentioned)
- Borrow interest (if mentioned)
- Borrow rate (if mentioned)
- Supply interest (if mentioned)
- Supply rate (if mentioned)
- Annual interest rate (if mentioned)
- Daily interest rate (if mentioned)
- Daily interest (if mentioned)
- Health factor (if mentioned)
- Liquidation threshold (if mentioned)
- Make sure to remove \`\`\`json and \`\`\` from the response

Respond with a JSON markdown block containing only the extracted values.`;
var PositionsAction = class {
  walletProvider;
  evaa;
  assetsData;
  assetsConfig;
  masterConstants;
  USDT;
  USDC;
  TON;
  totalSupply;
  totalBorrow;
  collector;
  userAssets;
  borrowInterest;
  predictAPY;
  withdrawalLimits;
  borrowLimits;
  constructor(walletProvider) {
    this.walletProvider = walletProvider;
    this.evaa = null;
    this.assetsData = null;
    this.assetsConfig = null;
    this.masterConstants = null;
    this.USDT = null;
    this.USDC = null;
    this.TON = null;
    this.userAssets = null;
    this.totalSupply = null;
    this.totalBorrow = null;
    this.borrowInterest = null;
    this.predictAPY = null;
    this.collector = null;
    this.withdrawalLimits = null;
    this.borrowLimits = null;
  }
  async getPositions() {
    const walletClient = this.walletProvider.getWalletClient();
    const wallet = walletClient.open(this.walletProvider.wallet);
    this.evaa = walletClient.open(
      new Evaa5({ poolConfig: TESTNET_POOL_CONFIG5 })
    );
    await this.evaa.getSync();
    this.assetsData = this.evaa.data?.assetsData;
    this.assetsConfig = this.evaa.data?.assetsConfig;
    this.masterConstants = this.evaa.poolConfig.masterConstants;
    this.USDT = {
      name: "USDT",
      data: this.assetsData.get(JUSDT_TESTNET5.assetId),
      config: this.assetsConfig.get(JUSDT_TESTNET5.assetId),
      asset: JUSDT_TESTNET5
    };
    this.USDC = {
      name: "USDC",
      data: this.assetsData.get(JUSDC_TESTNET5.assetId),
      config: this.assetsConfig.get(JUSDC_TESTNET5.assetId),
      asset: JUSDC_TESTNET5
    };
    this.TON = {
      name: "TON",
      data: this.assetsData.get(TON_TESTNET5.assetId),
      config: this.assetsConfig.get(TON_TESTNET5.assetId),
      asset: TON_TESTNET5
    };
    this.userAssets = [
      this.USDT,
      this.USDC,
      this.TON
    ];
    this.totalSupply = calculatePresentValue5(this.TON.data.sRate, this.TON.data.totalSupply, this.masterConstants);
    this.totalBorrow = calculatePresentValue5(this.TON.data.bRate, this.TON.data.totalBorrow, this.masterConstants);
    try {
      if (this.TON?.config?.baseBorrowRate && this.masterConstants?.FACTOR_SCALE && this.TON?.config?.borrowRateSlopeLow && this.TON?.config?.targetUtilization && this.TON?.config?.borrowRateSlopeHigh) {
        const baseBorrowRate = BigInt(this.TON.config.baseBorrowRate);
        const factorScale = BigInt(this.masterConstants.FACTOR_SCALE);
        const slopeLow = BigInt(this.TON.config.borrowRateSlopeLow);
        const slopeHigh = BigInt(this.TON.config.borrowRateSlopeHigh);
        const targetUtil = BigInt(this.TON.config.targetUtilization);
        const term1 = mulFactor5(factorScale, slopeLow, targetUtil);
        const term2 = mulFactor5(factorScale, slopeHigh, factorScale - targetUtil);
        this.borrowInterest = baseBorrowRate + BigInt(term1 || 0n) + BigInt(term2 || 0n);
      } else {
        this.borrowInterest = 0n;
      }
    } catch (error) {
      elizaLogger8.error("Error calculating borrow interest:", error);
      this.borrowInterest = 0n;
    }
    try {
      if (this.totalBorrow && this.TON?.data && this.TON?.config && this.masterConstants) {
        this.predictAPY = predictAPY5({
          amount: this.totalBorrow,
          balanceChangeType: BalanceChangeType5.Repay,
          assetData: this.TON.data,
          assetConfig: this.TON.config,
          masterConstants: this.masterConstants
        });
      } else {
        this.predictAPY = { supplyAPY: 0n, borrowAPY: 0n };
      }
    } catch (error) {
      elizaLogger8.error("Error calculating APY:", error);
      this.predictAPY = { supplyAPY: 0n, borrowAPY: 0n };
    }
    this.collector = new PricesCollector5(TESTNET_POOL_CONFIG5);
    const user = walletClient.open(
      await this.evaa.openUserContract(wallet.address)
    );
    await user.getSync(this.evaa.data.assetsData, this.evaa.data.assetsConfig, (await this.collector.getPrices()).dict, true);
    const data = user.data;
    elizaLogger8.log("User data:", data.fullyParsed);
    if (user.data?.type != "active") {
      elizaLogger8.log("User account is not active");
      return [];
    } else {
      this.withdrawalLimits = user.data.withdrawalLimits;
      this.borrowLimits = user.data.borrowLimits;
      const positions = [];
      for (const userAsset of this.userAssets) {
        const assetRates = calculateCurrentRates5(userAsset.config, userAsset.data, this.masterConstants);
        const { borrowInterest, bRate, now, sRate, supplyInterest } = assetRates;
        const ONE = 10n ** 13n;
        const annualInterestRateReadable = sRate / ONE;
        const dailyInterestRateReadable = annualInterestRateReadable / 365n;
        const annualRateFP = sRate;
        const dailyRateFP = sRate / 365n;
        const principal = userAsset.data.balance;
        const borrowPrincipal = user.data.borrowBalance;
        const supplyPrincipal = user.data.supplyBalance;
        let dailyBorrowInterestFP = 0n;
        let dailySupplyInterestFP = 0n;
        try {
          const borrowPrincipalBigInt = typeof borrowPrincipal === "bigint" ? borrowPrincipal : BigInt(borrowPrincipal || 0);
          const supplyPrincipalBigInt = typeof supplyPrincipal === "bigint" ? supplyPrincipal : BigInt(supplyPrincipal || 0);
          const dailyRateFPBigInt = typeof dailyRateFP === "bigint" ? dailyRateFP : BigInt(dailyRateFP || 0);
          const ONEBigInt = typeof ONE === "bigint" ? ONE : BigInt(ONE || 10n ** 13n);
          dailyBorrowInterestFP = borrowPrincipalBigInt * dailyRateFPBigInt / ONEBigInt;
          dailySupplyInterestFP = supplyPrincipalBigInt * dailyRateFPBigInt / ONEBigInt;
        } catch (error) {
          elizaLogger8.error("Error calculating daily interest:", error);
        }
        const healthFactor = user.data.healthFactor;
        elizaLogger8.debug("Asset ID", userAsset.name);
        elizaLogger8.debug("-------------------------------------------------");
        elizaLogger8.debug("Asset Balance", principal ? (Number(principal.toString()) / Number(ONE)).toFixed(2) : "0.00");
        elizaLogger8.debug("Asset Borrow Balance", borrowPrincipal ? (Number(borrowPrincipal.toString()) / Number(ONE)).toFixed(2) : "0.00");
        elizaLogger8.debug("Asset Supply Balance", supplyPrincipal ? (Number(supplyPrincipal.toString()) / Number(ONE)).toFixed(2) : "0.00");
        elizaLogger8.debug("-------------------------------------------------");
        elizaLogger8.debug("Asset Balance", principal ? principal.toString() : "0");
        elizaLogger8.debug("Asset Borrow Balance", borrowPrincipal ? borrowPrincipal.toString() : "0");
        elizaLogger8.debug("Asset Supply Balance", supplyPrincipal ? supplyPrincipal.toString() : "0");
        elizaLogger8.debug("-------------------------------------------------");
        elizaLogger8.debug("Asset Balance", principal ? formatCurrency(fromNano(principal), 2) : "0.00");
        elizaLogger8.debug("Asset Borrow Balance", borrowPrincipal ? formatCurrency(fromNano(borrowPrincipal), 2) : "0.00");
        elizaLogger8.debug("Asset Supply Balance", supplyPrincipal ? formatCurrency(fromNano(supplyPrincipal), 2) : "0.00");
        elizaLogger8.debug("Borrow Interest", formatCurrency(fromNano(borrowInterest), 6));
        elizaLogger8.debug("Borrow Rate", formatCurrency(fromNano(bRate / 100n), 2));
        elizaLogger8.debug("Supply Interest", formatCurrency(fromNano(supplyInterest), 6));
        elizaLogger8.debug("Supply Rate", formatCurrency(fromNano(sRate / 100n), 2));
        elizaLogger8.debug("Now", now.toString());
        elizaLogger8.debug("Annual Interest Rate: ", formatCurrency(fromNano(annualInterestRateReadable / 100n), 6));
        elizaLogger8.debug("Daily Interest Rate:  ", formatCurrency(fromNano(dailyInterestRateReadable / 100n), 6));
        elizaLogger8.debug("Daily Borrow Interest (on 1 token):", formatCurrency(fromNano(dailyBorrowInterestFP / 10n ** 13n), 6));
        elizaLogger8.debug("Daily Supply Interest (on 1 token):", formatCurrency(fromNano(dailySupplyInterestFP / 10n ** 13n), 6));
        elizaLogger8.debug("Annual Rate:", formatCurrency(fromNano(annualRateFP / 100n), 2));
        elizaLogger8.debug("Health Factor: ", healthFactor.toString());
        positions.push({
          assetId: userAsset.name,
          principal: principal ? formatCurrency(fromNano(principal), 2) : "0.00",
          borrowInterest: borrowInterest ? formatCurrency(fromNano(borrowInterest), 6) : "0.000000",
          borrowRate: bRate ? formatCurrency(fromNano(bRate / 100n), 2) : "0.00",
          supplyInterest: supplyInterest ? formatCurrency(fromNano(supplyInterest), 6) : "0.000000",
          supplyRate: sRate ? formatCurrency(fromNano(sRate / 100n), 2) : "0.00",
          annualInterestRate: annualInterestRateReadable ? formatCurrency(fromNano(annualInterestRateReadable / 100n), 6) + "%" : "0.000000%",
          dailyInterestRate: dailyInterestRateReadable ? formatCurrency(fromNano(dailyInterestRateReadable / 100n), 6) + "%" : "0.000000%",
          dailyInterest: dailyBorrowInterestFP ? formatCurrency(fromNano(dailyBorrowInterestFP / 10n ** 13n), 6) + "%" : "0.000000%",
          //accruedInterest: formatFixedPoint(accruedInterestFP),
          healthFactor: typeof healthFactor === "bigint" ? Number(healthFactor).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : healthFactor,
          liquidationThreshold: typeof userAsset.config.liquidationThreshold === "bigint" ? Number(userAsset.config.liquidationThreshold).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : userAsset.config.liquidationThreshold
        });
      }
      return positions;
    }
  }
};
var positionsAction = {
  name: "EVAA_POSITIONS",
  similes: [
    "BORROW_POSITIONS",
    "GET_BORROW_POSITIONS",
    "VIEW_BORROWED_POSITIONS",
    "CHECK_LOAN_STATUS",
    "SHOW_BORROWED_ASSETS"
  ],
  description: "Calculates and displays accrued interest and health factors for borrowed positions",
  validate: async (runtime) => {
    const walletProvider = await initWalletProvider(runtime);
    return !!walletProvider.getAddress();
  },
  handler: async (runtime, message, state, options, callback) => {
    elizaLogger8.info("Starting GetBorrowPositions handler");
    try {
      const positionsContext = composeContext8({
        state,
        template: positionsTemplate
      });
      const content = await generateObject8({
        runtime,
        context: positionsContext,
        schema: positionsSchema,
        modelClass: ModelClass8.LARGE
      });
      const positionsDetails = content.object;
      elizaLogger8.debug(`Positions details: ${JSON.stringify(content.object)}`);
      if (!isPositionsContent(positionsDetails)) {
        throw new Error("Invalid borrowing parameters");
      }
      const walletProvider = await initWalletProvider(runtime);
      const action = new PositionsAction(walletProvider);
      const positions = await action.getPositions();
      if (callback) {
        const responseObject = {
          positions
        };
        let responseText = `You have ${responseObject.positions.length} evaa positions:
`;
        for (let position of responseObject.positions) {
          const textPosition = `
                        Asset: ${position.assetId}
                        Balance: ${position.principal} ${position.assetId} tokens
                        Borrow Interest: ${position.borrowInterest} units
                        Borrow Rate: ${position.borrowRate} units
                        Supply Interest: ${position.supplyInterest} units
                        Supply Rate: ${position.supplyRate} units
                        Annual Interest Rate: ${position.annualInterestRate}
                        Daily Interest Rate: ${position.dailyInterestRate}
                        Daily Interest: ${position.dailyInterest}
                        Health Factor: ${position.healthFactor} (safe > 1.0)
                        Liquidation Threshold: ${position.liquidationThreshold} units
                        
`;
          responseText += textPosition;
        }
        callback({
          text: responseText,
          status: "success",
          positions: responseObject.positions,
          metadata: {
            positions: responseObject.positions,
            totalPositions: positions.length,
            timestamp: Date.now()
          }
        });
      }
      return true;
    } catch (error) {
      elizaLogger8.error(`Error in get borrowed positions handler: ${error}`);
      if (callback) {
        callback({
          text: `Failed to get borrowed positions: ${error.message}`,
          status: "error"
        });
      }
      return false;
    }
  },
  examples: [
    [
      {
        user: "{{user1}}",
        content: {
          text: "Show me my positions and accrued interest from the EVAA protocol"
        }
      },
      {
        user: "{{agentName}}",
        content: {
          text: "{{responseData}}",
          action: "POSITIONS"
        }
      }
    ],
    [
      {
        user: "{{user1}}",
        content: {
          text: "What is my current health factor across all positions?"
        }
      },
      {
        user: "{{agentName}}",
        content: {
          text: "{{responseData}}",
          action: "POSITIONS"
        }
      }
    ]
  ]
};
var evaaPositions_default = positionsAction;

// src/actions/stake.ts
import {
  elizaLogger as elizaLogger10,
  composeContext as composeContext9,
  ModelClass as ModelClass9,
  generateObject as generateObject9
} from "@elizaos/core";

// src/providers/staking.ts
import { Address as Address15, SendMode as SendMode6 } from "@ton/ton";
import { mnemonicToPrivateKey } from "@ton/crypto";

// src/services/staking/platformFactory.ts
import { elizaLogger as elizaLogger9 } from "@elizaos/core";
import { Address as Address6 } from "@ton/ton";

// src/services/staking/config/platformConfig.ts
var PLATFORM_TYPES = ["TON_WHALES", "HIPO"];
var STAKING_POOL_ADDRESSES = {
  TON_WHALES: [
    "kQDV1LTU0sWojmDUV4HulrlYPpxLWSUjM6F3lUurMbwhales",
    "kQAHBakDk_E7qLlNQZxJDsqj_ruyAFpqarw85tO-c03fK26F"
  ],
  HIPO: ["kQAlDMBKCT8WJ4nwdwNRp0lvKMP4vUnHYspFPhEnyR36cg44"]
};

// src/services/staking/platformFactory.ts
function isPlatformType(type) {
  return PLATFORM_TYPES.includes(type);
}
var PlatformFactory = class {
  static strategies = /* @__PURE__ */ new Map();
  static addresses;
  static {
    this.addresses = Object.fromEntries(
      Object.entries(STAKING_POOL_ADDRESSES).map(([type, addrs]) => [
        type,
        addrs.map((addr) => Address6.parse(addr))
      ])
    );
  }
  static register(type, strategy) {
    this.strategies.set(type, strategy);
  }
  static getStrategy(address) {
    const type = this.getPlatformType(address);
    if (!type) {
      elizaLogger9.info(`Unknown platform address: ${address}`);
      return null;
    }
    const strategy = this.strategies.get(type);
    if (!strategy) {
      elizaLogger9.warn(`No strategy implemented for platform: ${type}`);
      return null;
    }
    elizaLogger9.debug(`Found strategy for platform: ${type}`);
    return strategy;
  }
  static getAllStrategies() {
    return Array.from(this.strategies.values());
  }
  static getPlatformType(address) {
    const entry = Object.entries(this.addresses).find(
      ([_, addresses]) => addresses.some((addr) => addr.equals(address))
    );
    if (!entry) return null;
    const [type] = entry;
    return isPlatformType(type) ? type : null;
  }
  static getAllAddresses() {
    return Object.values(this.addresses).flat();
  }
  static getAddressesByType(type) {
    return this.addresses[type] || [];
  }
  static getAvailablePlatformTypes() {
    return [...PLATFORM_TYPES];
  }
};

// src/services/staking/strategies/tonWhales.ts
import {
  Address as Address7,
  beginCell as beginCell6,
  Dictionary as Dictionary6,
  toNano as toNano5
} from "@ton/ton";
import { internal as internal7 } from "@ton/ton";
function generateQueryId() {
  return Math.floor(Math.random() * Number.MAX_SAFE_INTEGER);
}
function parseMembersRaw(stack) {
  const cell = stack.items[0].cell;
  const dict = Dictionary6.loadDirect(
    Dictionary6.Keys.BigInt(256),
    {
      serialize: (src, builder) => {
      },
      parse: (slice) => {
        try {
          const profitPerCoin = slice.loadUintBig(128);
          const balance = slice.loadCoins();
          const pendingWithdraw = slice.loadCoins();
          const pendingWithdrawAll = slice.loadUintBig(1) === 1n;
          const pendingDeposit = slice.loadCoins();
          const memberWithdraw = slice.loadCoins();
          return {
            profit_per_coin: profitPerCoin,
            balance,
            pending_withdraw: pendingWithdraw,
            pending_withdraw_all: pendingWithdrawAll,
            pending_deposit: pendingDeposit,
            member_withdraw: memberWithdraw
          };
        } catch (e) {
          console.error("Parse error:", e);
          return {
            error: e.message,
            sliceData: slice.toString()
          };
        }
      }
    },
    cell
  );
  const members = [];
  for (const [key, value] of dict) {
    let bigIntKey;
    if (typeof key === "bigint") {
      bigIntKey = key;
    } else if (typeof key === "string") {
      const numStr = key.startsWith("b:") ? key.substring(2) : key;
      bigIntKey = BigInt(numStr);
    } else {
      bigIntKey = BigInt(key.toString());
    }
    if (bigIntKey < 0n) {
      bigIntKey = (1n << 256n) + bigIntKey;
    }
    const rawAddress = bigIntKey.toString(16).replace("0x", "").padStart(64, "0");
    const address = new Address7(0, Buffer.from(rawAddress, "hex"));
    members.push({
      address,
      ...value
    });
  }
  return members;
}
var TonWhalesStrategy = class {
  constructor(tonClient, walletProvider) {
    this.tonClient = tonClient;
    this.walletProvider = walletProvider;
  }
  async getPendingWithdrawal(walletAddress, poolAddress) {
    const memberData = await this.getMemberData(walletAddress, poolAddress);
    return memberData?.pending_withdraw ?? BigInt("0");
  }
  async getStakedTon(walletAddress, poolAddress) {
    const memberData = await this.getMemberData(walletAddress, poolAddress);
    if (memberData?.pending_withdraw) return memberData.balance - memberData.pending_withdraw;
    return memberData?.balance ?? BigInt("0");
  }
  async getPoolInfo(poolAddress) {
    try {
      const poolParams = (await this.tonClient.runMethod(poolAddress, "get_params")).stack;
      const poolStatus = (await this.tonClient.runMethod(poolAddress, "get_pool_status")).stack;
      return {
        address: poolAddress,
        min_stake: poolParams.skip(2).readBigNumber(),
        deposit_fee: poolParams.readBigNumber(),
        withdraw_fee: poolParams.readBigNumber(),
        balance: poolStatus.readBigNumber(),
        pending_deposits: poolStatus.skip().readBigNumber(),
        pending_withdraws: poolStatus.readBigNumber()
      };
    } catch (error) {
      console.error("Error fetching TonWhales pool info:", error);
      throw error;
    }
  }
  async createStakeMessage(poolAddress, amount) {
    const queryId = generateQueryId();
    const payload = beginCell6().storeUint(2077040623, 32).storeUint(queryId, 64).storeCoins(1e5).endCell();
    const intMessage = internal7({
      to: poolAddress,
      value: toNano5(amount),
      bounce: true,
      init: null,
      body: payload
    });
    return intMessage;
  }
  async createUnstakeMessage(poolAddress, amount) {
    const queryId = generateQueryId();
    const payload = beginCell6().storeUint(3665837821, 32).storeUint(queryId, 64).storeCoins(1e5).storeCoins(toNano5(amount)).endCell();
    const intMessage = internal7({
      to: poolAddress,
      value: 200000000n,
      //toNano(unstakeAmount),
      bounce: true,
      init: null,
      body: payload
      // Adjust this message if your staking contract requires a different format.
    });
    return intMessage;
  }
  async getMemberData(address, poolAddress) {
    const result = await this.tonClient.runMethod(
      poolAddress,
      "get_members_raw"
    );
    const memberData = await parseMembersRaw(result.stack);
    const member = memberData.find((member2) => {
      try {
        return member2.address.equals(address);
      } catch (e) {
        console.error(e, member2.address, address);
        return false;
      }
    });
    return member;
  }
};

// src/services/staking/strategies/hipo.ts
import {
  Address as Address13,
  beginCell as beginCell9,
  fromNano as fromNano3,
  toNano as toNano6
} from "@ton/ton";
import { internal as internal8 } from "@ton/ton";

// src/services/staking/strategies/hipo/sdk/Constants.ts
import { Address as Address8 } from "@ton/ton";
var treasuryAddresses = /* @__PURE__ */ new Map([
  ["mainnet", Address8.parse("EQCLyZHP4Xe8fpchQz76O-_RmUhaVc_9BAoGyJrwJrcbz2eZ")],
  ["testnet", Address8.parse("kQAlDMBKCT8WJ4nwdwNRp0lvKMP4vUnHYspFPhEnyR36cg44")]
]);
var feeStake = 100000000n;
var feeUnstake = 100000000n;

// src/services/staking/strategies/hipo/sdk/Helpers.ts
import { beginCell as beginCell7 } from "@ton/ton";

// src/services/staking/strategies/hipo/sdk/Treasury.ts
import {
  beginCell as beginCell8,
  Dictionary as Dictionary7
} from "@ton/ton";
var emptyDictionaryValue = {
  serialize: function() {
    return;
  },
  parse: function() {
    return {};
  }
};
var sortedDictionaryValue = {
  serialize: function(src, builder) {
    builder.storeRef(beginCell8().storeDictDirect(src));
  },
  parse: function(src) {
    return src.loadRef().beginParse().loadDictDirect(Dictionary7.Keys.BigUint(256), emptyDictionaryValue);
  }
};
var requestDictionaryValue = {
  serialize: function(src, builder) {
    builder.storeCoins(src.minPayment).storeUint(src.borrowerRewardShare, 8).storeCoins(src.loanAmount).storeCoins(src.accrueAmount).storeCoins(src.stakeAmount).storeRef(src.newStakeMsg);
  },
  parse: function(src) {
    return {
      minPayment: src.loadCoins(),
      borrowerRewardShare: src.loadUintBig(8),
      loanAmount: src.loadCoins(),
      accrueAmount: src.loadCoins(),
      stakeAmount: src.loadCoins(),
      newStakeMsg: src.loadRef()
    };
  }
};
var participationDictionaryValue = {
  serialize: function(src, builder) {
    builder.storeUint(src.state ?? 0, 4).storeUint(src.size ?? 0, 16).storeDict(src.sorted).storeDict(src.requests).storeDict(src.rejected).storeDict(src.accepted).storeDict(src.accrued).storeDict(src.staked).storeDict(src.recovering).storeCoins(src.totalStaked ?? 0).storeCoins(src.totalRecovered ?? 0).storeUint(src.currentVsetHash ?? 0, 256).storeUint(src.stakeHeldFor ?? 0, 32).storeUint(src.stakeHeldUntil ?? 0, 32);
  },
  parse: function(src) {
    return {
      state: src.loadUint(4),
      size: src.loadUintBig(16),
      sorted: src.loadDict(Dictionary7.Keys.BigUint(112), sortedDictionaryValue),
      requests: src.loadDict(Dictionary7.Keys.BigUint(256), requestDictionaryValue),
      rejected: src.loadDict(Dictionary7.Keys.BigUint(256), requestDictionaryValue),
      accepted: src.loadDict(Dictionary7.Keys.BigUint(256), requestDictionaryValue),
      accrued: src.loadDict(Dictionary7.Keys.BigUint(256), requestDictionaryValue),
      staked: src.loadDict(Dictionary7.Keys.BigUint(256), requestDictionaryValue),
      recovering: src.loadDict(Dictionary7.Keys.BigUint(256), requestDictionaryValue),
      totalStaked: src.loadCoins(),
      totalRecovered: src.loadCoins(),
      currentVsetHash: src.loadUintBig(256),
      stakeHeldFor: src.loadUintBig(32),
      stakeHeldUntil: src.loadUintBig(32)
    };
  }
};
var Treasury = class _Treasury {
  constructor(address) {
    this.address = address;
  }
  static createFromAddress(address) {
    return new _Treasury(address);
  }
  async getTimes(provider) {
    const { stack } = await provider.get("get_times", []);
    return {
      currentRoundSince: stack.readBigNumber(),
      participateSince: stack.readBigNumber(),
      participateUntil: stack.readBigNumber(),
      nextRoundSince: stack.readBigNumber(),
      nextRoundUntil: stack.readBigNumber(),
      stakeHeldFor: stack.readBigNumber()
    };
  }
  async getTreasuryState(provider) {
    const { stack } = await provider.get("get_treasury_state", []);
    return {
      totalCoins: stack.readBigNumber(),
      totalTokens: stack.readBigNumber(),
      totalStaking: stack.readBigNumber(),
      totalUnstaking: stack.readBigNumber(),
      totalBorrowersStake: stack.readBigNumber(),
      parent: stack.readAddressOpt(),
      participations: Dictionary7.loadDirect(
        Dictionary7.Keys.BigUint(32),
        participationDictionaryValue,
        stack.readCellOpt()
      ),
      roundsImbalance: stack.readBigNumber(),
      stopped: stack.readBoolean(),
      instantMint: stack.readBoolean(),
      loanCodes: Dictionary7.loadDirect(Dictionary7.Keys.BigUint(32), Dictionary7.Values.Cell(), stack.readCell()),
      lastStaked: stack.readBigNumber(),
      lastRecovered: stack.readBigNumber(),
      halter: stack.readAddress(),
      governor: stack.readAddress(),
      proposedGovernor: stack.readCellOpt(),
      governanceFee: stack.readBigNumber(),
      collectionCodes: Dictionary7.loadDirect(
        Dictionary7.Keys.BigUint(32),
        Dictionary7.Values.Cell(),
        stack.readCell()
      ),
      billCodes: Dictionary7.loadDirect(Dictionary7.Keys.BigUint(32), Dictionary7.Values.Cell(), stack.readCell()),
      oldParents: Dictionary7.loadDirect(Dictionary7.Keys.BigUint(256), emptyDictionaryValue, stack.readCellOpt())
    };
  }
};

// src/services/staking/strategies/hipo/sdk/Parent.ts
import { TupleBuilder } from "@ton/ton";
var Parent = class _Parent {
  constructor(address) {
    this.address = address;
  }
  static createFromAddress(address) {
    return new _Parent(address);
  }
  async getWalletAddress(provider, owner) {
    const tb = new TupleBuilder();
    tb.writeAddress(owner);
    const { stack } = await provider.get("get_wallet_address", tb.build());
    return stack.readAddress();
  }
};

// src/services/staking/strategies/hipo/sdk/Wallet.ts
import { Dictionary as Dictionary8 } from "@ton/ton";
var Wallet = class _Wallet {
  constructor(address) {
    this.address = address;
  }
  static createFromAddress(address) {
    return new _Wallet(address);
  }
  async getWalletState(provider) {
    const { stack } = await provider.get("get_wallet_state", []);
    return {
      tokens: stack.readBigNumber(),
      staking: Dictionary8.loadDirect(
        Dictionary8.Keys.BigUint(32),
        Dictionary8.Values.BigVarUint(4),
        stack.readCellOpt()
      ),
      unstaking: stack.readBigNumber()
    };
  }
};

// src/services/staking/strategies/hipo.ts
async function getTreasuryState(tonClient, treasuryAddress) {
  const treasuryInstance = Treasury;
  const treasury = tonClient.open(
    treasuryInstance.createFromAddress(treasuryAddress)
  );
  return treasury.getTreasuryState();
}
async function getHipoWallet(tonClient, address, treasuryAddress) {
  const treasuryState = await getTreasuryState(tonClient, treasuryAddress);
  if (!treasuryState.parent) throw new Error("No parent in treasury state");
  const parent = tonClient.open(
    Parent.createFromAddress(treasuryState.parent)
  );
  const walletAddress = await parent.getWalletAddress(address);
  const hipoWalletInstance = Wallet;
  const hipoWallet = tonClient.open(
    hipoWalletInstance.createFromAddress(walletAddress)
  );
  return hipoWallet;
}
async function getExchangeRate(tonClient, treasuryAddress) {
  const treasuryState = await getTreasuryState(tonClient, treasuryAddress);
  return Number(treasuryState.totalTokens) / Number(treasuryState.totalCoins);
}
function calculateJettonsToTon(jettons, rate) {
  console.info(jettons);
  return !rate || !jettons ? BigInt(0) : BigInt(toNano6(Number(fromNano3(jettons)) * (1 / rate)));
}
var HipoStrategy = class {
  constructor(tonClient, walletProvider) {
    this.tonClient = tonClient;
    this.walletProvider = walletProvider;
  }
  async getPendingWithdrawal(address, poolAddress) {
    const hipoWallet = await getHipoWallet(
      this.tonClient,
      address,
      poolAddress
    );
    const walletState = await hipoWallet.getWalletState();
    const rate = await getExchangeRate(this.tonClient, poolAddress);
    return calculateJettonsToTon(walletState.unstaking, rate);
  }
  async getStakedTon(address, poolAddress) {
    const hipoWallet = await getHipoWallet(
      this.tonClient,
      address,
      poolAddress
    );
    const walletState = await hipoWallet.getWalletState();
    const rate = await getExchangeRate(this.tonClient, poolAddress);
    return calculateJettonsToTon(walletState.tokens, rate);
  }
  async getPoolInfo(poolAddress) {
    try {
      const result = await getTreasuryState(this.tonClient, poolAddress);
      const rate = await getExchangeRate(this.tonClient, poolAddress);
      return {
        address: poolAddress,
        min_stake: BigInt(0),
        deposit_fee: feeStake,
        withdraw_fee: feeUnstake,
        balance: calculateJettonsToTon(result.totalTokens, rate),
        pending_deposits: calculateJettonsToTon(result.totalStaking, rate),
        pending_withdraws: calculateJettonsToTon(result.totalUnstaking, rate)
      };
    } catch (error) {
      console.error("Error fetching Hipo pool info:", error);
      throw error;
    }
  }
  async createStakeMessage(poolAddress, amount) {
    const payload = beginCell9().storeUint(1027039654, 32).storeUint(0n, 64).storeAddress(null).storeCoins(toNano6(amount)).storeCoins(1n).storeAddress(null).endCell();
    const intMessage = internal8({
      to: poolAddress,
      value: toNano6(amount) + 100000000n,
      body: payload,
      bounce: true,
      init: null
    });
    return intMessage;
  }
  async createUnstakeMessage(poolAddress, amount) {
    const rate = await getExchangeRate(this.tonClient, poolAddress);
    const jettonAmount = amount * rate;
    const payload = beginCell9().storeUint(1499400124, 32).storeUint(0n, 64).storeCoins(toNano6(jettonAmount)).storeAddress(void 0).storeMaybeRef(beginCell9().storeUint(0, 4).storeCoins(1n)).endCell();
    const hipoWallet = await getHipoWallet(
      this.tonClient,
      Address13.parse(this.walletProvider.getAddress()),
      poolAddress
    );
    const intMessage = internal8({
      to: hipoWallet.address,
      value: 100000000n,
      body: payload,
      bounce: true,
      init: null
    });
    return intMessage;
  }
};

// src/utils/formatting.ts
import { fromNano as fromNano4 } from "@ton/ton";
var truncateTONAddress = (address) => {
  const addressString = address.toString();
  if (addressString.length <= 12) return addressString;
  return `${addressString.slice(0, 6)}...${addressString.slice(-6)}`;
};
var formatTON = (value) => {
  const num = parseFloat(fromNano4(value));
  return num.toFixed(2);
};

// src/providers/staking.ts
var StakingProvider = class {
  client;
  walletProvider;
  contract;
  constructor(walletProvider) {
    this.walletProvider = walletProvider;
    this.client = walletProvider.getWalletClient();
    this.contract = this.client.open(walletProvider.wallet);
    PlatformFactory.register("TON_WHALES", new TonWhalesStrategy(this.client, this.walletProvider));
    PlatformFactory.register("HIPO", new HipoStrategy(this.client, this.walletProvider));
  }
  // Private helper method to get the contract handle from the TON client.
  async getContract(poolId) {
    return await this.client.open(poolId);
  }
  async stake(poolId, amount) {
    const poolAddress = Address15.parse(poolId);
    try {
      const seqno = await this.contract.getSeqno();
      const strategy = PlatformFactory.getStrategy(poolAddress);
      const minStake = (await strategy.getPoolInfo(poolAddress)).min_stake;
      if (minStake > amount) throw new Error(`Minimum stake is ${minStake}`);
      const stakeMessage = await strategy.createStakeMessage(poolAddress, amount);
      const transfer = await this.contract.createTransfer({
        seqno,
        secretKey: this.walletProvider.keypair.secretKey,
        sendMode: SendMode6.IGNORE_ERRORS | SendMode6.PAY_GAS_SEPARATELY,
        messages: [stakeMessage],
        validUntil: Math.floor(Date.now() / 1e3) + 300
      });
      await this.client.sendExternalMessage(this.walletProvider.wallet, transfer);
      return transfer.hash;
    } catch (error) {
      console.error("Error staking TON:", error);
      return null;
    }
  }
  async unstake(poolId, amount) {
    const poolAddress = Address15.parse(poolId);
    try {
      const seqno = await this.contract.getSeqno();
      const strategy = PlatformFactory.getStrategy(poolAddress);
      const stakedTon = await strategy.getStakedTon(Address15.parse(this.walletProvider.getAddress()), poolAddress);
      if (stakedTon <= 0) throw new Error("No TON staked in the provided pool");
      const unstakeMessage = await strategy.createUnstakeMessage(poolAddress, amount);
      const transfer = await this.contract.createTransfer({
        seqno,
        secretKey: this.walletProvider.keypair.secretKey,
        sendMode: SendMode6.IGNORE_ERRORS | SendMode6.PAY_GAS_SEPARATELY,
        messages: [unstakeMessage],
        validUntil: Math.floor(Date.now() / 1e3) + 300
      });
      await this.client.sendExternalMessage(this.walletProvider.wallet, transfer);
      return transfer.hash;
    } catch (error) {
      console.error("Error unstaking TON:", error);
      return null;
    }
  }
  formatPoolInfo(poolInfo) {
    return [
      `Pool Address: ${truncateTONAddress(poolInfo.address)}`,
      "",
      "Parameters",
      "\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500",
      `Min Stake:     ${formatTON(poolInfo.min_stake)} TON`,
      `Deposit Fee:   ${formatTON(poolInfo.deposit_fee)} TON`,
      `Withdraw Fee:  ${formatTON(poolInfo.withdraw_fee)} TON`,
      "",
      "Current Status",
      "\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500",
      `Balance:          ${formatTON(poolInfo.balance)} TON`,
      `Pending Deposits: ${formatTON(poolInfo.pending_deposits)} TON`,
      `Pending Withdraws: ${formatTON(poolInfo.pending_withdraws)} TON`
    ].join("\n");
  }
  async getPoolInfo(poolId) {
    const poolAddress = Address15.parse(poolId);
    try {
      const strategy = PlatformFactory.getStrategy(poolAddress);
      const info = await strategy.getPoolInfo(poolAddress);
      return info;
    } catch (error) {
      console.error("Error fetching pool info:", error);
      throw error;
    }
  }
  async getFormattedPoolInfo(poolId) {
    return this.formatPoolInfo(await this.getPoolInfo(poolId));
  }
  async getPortfolio() {
    const walletAddress = Address15.parse(this.walletProvider.getAddress());
    const stakingPositions = [];
    const stakingPoolAddresses = PlatformFactory.getAllAddresses();
    await Promise.all(
      stakingPoolAddresses.map(async (poolAddress) => {
        const strategy = PlatformFactory.getStrategy(poolAddress);
        if (!strategy) return;
        const stakedTon = await strategy.getStakedTon(walletAddress, poolAddress);
        const pendingWithdrawal = await strategy.getPendingWithdrawal(walletAddress, poolAddress);
        if (!stakedTon && !pendingWithdrawal) return;
        stakingPositions.push({
          poolAddress: truncateTONAddress(poolAddress),
          amount: formatTON(stakedTon),
          pending: formatTON(pendingWithdrawal)
        });
      })
    );
    if (stakingPositions.length === 0) {
      return "TON Staking Portfolio: No active staking positions found";
    }
    const totalStaked = stakingPositions.reduce((sum, pos) => sum + parseFloat(pos.amount), 0).toFixed(2);
    const positions = stakingPositions.map((pos) => `Pool ${pos.poolAddress}: Amount:${pos.amount} TON, Pending Withdrawal: ${pos.pending} TON`).join("\n");
    return [
      "TON Staking Portfolio",
      "\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500",
      positions,
      "",
      `Total Staked: ${totalStaked} TON`
    ].join("\n");
  }
};
var initStakingProvider = async (runtime) => {
  const privateKey = runtime.getSetting("TON_PRIVATE_KEY");
  let mnemonics;
  if (!privateKey) {
    throw new Error("TON_PRIVATE_KEY is missing");
  } else {
    mnemonics = privateKey.split(" ");
    if (mnemonics.length < 2) {
      throw new Error("TON_PRIVATE_KEY mnemonic seems invalid");
    }
  }
  const rpcUrl = runtime.getSetting("TON_RPC_URL") || "https://toncenter.com/api/v2/jsonRPC";
  const keypair = await mnemonicToPrivateKey(mnemonics, "");
  const walletProvider = new WalletProvider(keypair, rpcUrl, runtime.cacheManager);
  return new StakingProvider(walletProvider);
};
var nativeStakingProvider = {
  async get(runtime, message, state) {
    try {
      const stakingProvider = await initStakingProvider(runtime);
      const stakingPortfolio = await stakingProvider.getPortfolio();
      const poolAddresses = await PlatformFactory.getAllAddresses();
      const providerString = `Portfolio: ${stakingPortfolio}
 Available Staking Pool Addresses: [ ${poolAddresses.map((e) => e.toString()).join(" | ")} ]`;
      console.info(providerString);
      return providerString;
    } catch (error) {
      console.error("Error in staking provider:", error);
      return null;
    }
  }
};

// src/actions/stake.ts
function isStakeContent(content) {
  return typeof content.poolId === "string" && (typeof content.amount === "string" || typeof content.amount === "number");
}
var stakeTemplate = `Respond with a JSON markdown block containing only the extracted values. Use null for any values that cannot be determined.

Example response:
\`\`\`json
{
    "poolId": "pool123",
    "amount": "1.5"
}
\`\`\`

{{recentMessages}}

Given the recent messages, extract the following information for staking TON:
- Pool identifier (poolId)
- Amount to stake

Respond with a JSON markdown block containing only the extracted values.`;
var StakeAction = class {
  constructor(stakingProvider) {
    this.stakingProvider = stakingProvider;
  }
  async stake(params) {
    elizaLogger10.log(
      `Staking: ${params.amount} TON in pool (${params.poolId}) using wallet provider`
    );
    try {
      return await this.stakingProvider.stake(params.poolId, Number(params.amount));
    } catch (error) {
      throw new Error(`Staking failed: ${error.message}`);
    }
  }
};
var buildStakeDetails = async (runtime, message, state) => {
  if (!state) {
    state = await runtime.composeState(message);
  } else {
    state = await runtime.updateRecentMessageState(state);
  }
  const stakeSchema = z.object({
    poolId: z.string(),
    amount: z.union([z.string(), z.number()])
  });
  const stakeContext = composeContext9({
    state,
    template: stakeTemplate
  });
  const content = await generateObject9({
    runtime,
    context: stakeContext,
    schema: stakeSchema,
    modelClass: ModelClass9.SMALL
  });
  return content.object;
};
var stake_default = {
  name: "DEPOSIT_TON",
  similes: ["STAKE_TOKENS", "DEPOSIT_TON", "DEPOSIT_TOKEN"],
  description: "Deposit TON tokens in a specified pool.",
  handler: async (runtime, message, state, options, callback) => {
    elizaLogger10.log("Starting DEPOSIT_TON handler...");
    const stakeDetails = await buildStakeDetails(runtime, message, state);
    if (!isStakeContent(stakeDetails)) {
      elizaLogger10.error("Invalid content for DEPOSIT_TON action.");
      if (callback) {
        callback({
          text: "Invalid staking details provided.",
          content: { error: "Invalid staking content" }
        });
      }
      return false;
    }
    try {
      const walletProvider = await initWalletProvider(runtime);
      const stakingProvider = await initStakingProvider(runtime);
      const action = new StakeAction(stakingProvider);
      const txHash = await action.stake(stakeDetails);
      if (callback) {
        callback({
          text: `Successfully staked ${stakeDetails.amount} TON in pool ${stakeDetails.poolId}. Transaction: ${txHash}`,
          content: {
            success: true,
            hash: txHash,
            amount: stakeDetails.amount,
            poolId: stakeDetails.poolId
          }
        });
      }
      return true;
    } catch (error) {
      elizaLogger10.error("Error during staking:", error);
      if (callback) {
        callback({
          text: `Error staking TON: ${error.message}`,
          content: { error: error.message }
        });
      }
      return false;
    }
  },
  template: stakeTemplate,
  validate: async (runtime) => {
    elizaLogger10.info("VALIDATING TON STAKING ACTION");
    return true;
  },
  examples: [
    [
      {
        user: "{{user1}}",
        content: {
          text: "Deposit 1.5 TON in pool pool123",
          action: "DEPOSIT_TON"
        }
      },
      {
        user: "{{user2}}",
        content: {
          text: "I'll deposit 1.5 TON now...",
          action: "DEPOSIT_TON"
        }
      },
      {
        user: "{{user2}}",
        content: {
          text: "Successfully deposited 1.5 TON in pool pool123, Transaction: abcd1234efgh5678"
        }
      }
    ]
  ]
};

// src/actions/unstake.ts
import {
  elizaLogger as elizaLogger11,
  composeContext as composeContext10,
  ModelClass as ModelClass10,
  generateObject as generateObject10
} from "@elizaos/core";
function isUnstakeContent(content) {
  return typeof content.poolId === "string" && (typeof content.amount === "string" || typeof content.amount === "number");
}
var unstakeTemplate = `Respond with a JSON markdown block containing only the extracted values. Use null for any values that cannot be determined.

Example response:
\`\`\`json
{
    "poolId": "pool123",
    "amount": "1.0"
}
\`\`\`

{{recentMessages}}

Given the recent messages, extract the following information for unstaking TON:
- Pool identifier (poolId)
- Amount to unstake

Respond with a JSON markdown block containing only the extracted values.`;
var UnstakeAction = class {
  constructor(stakingProvider) {
    this.stakingProvider = stakingProvider;
  }
  async unstake(params) {
    elizaLogger11.log(
      `Unstaking: ${params.amount} TON from pool (${params.poolId})`
    );
    try {
      return await this.stakingProvider.unstake(
        params.poolId,
        Number(params.amount)
      );
    } catch (error) {
      throw new Error(`Unstaking failed: ${error.message}`);
    }
  }
};
var buildUnstakeDetails = async (runtime, message, state) => {
  if (!state) {
    state = await runtime.composeState(message);
  } else {
    state = await runtime.updateRecentMessageState(state);
  }
  const unstakeSchema = z.object({
    poolId: z.string(),
    amount: z.union([z.string(), z.number()])
  });
  const unstakeContext = composeContext10({
    state,
    template: unstakeTemplate
  });
  const content = await generateObject10({
    runtime,
    context: unstakeContext,
    schema: unstakeSchema,
    modelClass: ModelClass10.SMALL
  });
  return content.object;
};
var unstake_default = {
  name: "WITHDRAW_TON",
  similes: ["UNSTAKE_TOKENS", "WITHDRAW_TON", "TON_UNSTAKE"],
  description: "Withdraw TON tokens from a specified pool.",
  handler: async (runtime, message, state, options, callback) => {
    elizaLogger11.log("Starting WITHDRAW_TON handler...");
    const unstakeDetails = await buildUnstakeDetails(
      runtime,
      message,
      state
    );
    if (!isUnstakeContent(unstakeDetails)) {
      elizaLogger11.error("Invalid content for WITHDRAW_TON action.");
      if (callback) {
        callback({
          text: "Invalid unstake details provided.",
          content: { error: "Invalid unstake content" }
        });
      }
      return false;
    }
    try {
      const stakingProvider = await initStakingProvider(runtime);
      const action = new UnstakeAction(stakingProvider);
      const txHash = await action.unstake(unstakeDetails);
      if (callback) {
        callback({
          text: `Successfully unstaked ${unstakeDetails.amount} TON from pool ${unstakeDetails.poolId}. Transaction: ${txHash}`,
          content: {
            success: true,
            hash: txHash,
            amount: unstakeDetails.amount,
            poolId: unstakeDetails.poolId
          }
        });
      }
      return true;
    } catch (error) {
      elizaLogger11.error("Error during unstaking:", error);
      if (callback) {
        callback({
          text: `Error unstaking TON: ${error.message}`,
          content: { error: error.message }
        });
      }
      return false;
    }
  },
  template: unstakeTemplate,
  validate: async (runtime) => true,
  examples: [
    [
      {
        user: "{{user1}}",
        content: {
          text: "Withdraw 1 TON from pool pool123",
          action: "WITHDRAW_TON"
        }
      },
      {
        user: "{{user2}}",
        content: {
          text: "I'll unstake 1 TON now...",
          action: "WITHDRAW_TON"
        }
      },
      {
        user: "{{user2}}",
        content: {
          text: "Successfully unstaked 1 TON from pool pool123, Transaction: efgh5678abcd1234"
        }
      }
    ],
    [
      {
        user: "{{user1}}",
        content: {
          text: "withdraw 12 TON from pool eqw237595asd432",
          action: "WITHDRAW_TON"
        }
      },
      {
        user: "{{user2}}",
        content: {
          text: "Withdrawing 12 TON right now...",
          action: "WITHDRAW_TON"
        }
      },
      {
        user: "{{user2}}",
        content: {
          text: "Successfully unstaked 12 TON from pool eqw237595asd432, Transaction: efgesdrf234h5678abcd1234"
        }
      }
    ]
  ]
};

// src/actions/getPoolInfo.ts
import {
  elizaLogger as elizaLogger12,
  composeContext as composeContext11,
  ModelClass as ModelClass11,
  generateObject as generateObject11
} from "@elizaos/core";
function isPoolInfoContent(content) {
  return typeof content.poolId === "string";
}
var getPoolInfoTemplate = `Respond with a JSON markdown block containing only the extracted values. Use null for any values that cannot be determined.

Example response:
\`\`\`json
{
    "poolId": string
}
\`\`\`

{{recentMessages}}

Given the recent messages, extract the pool identifier (TON address) for which to fetch staking pool information.

Respond with a JSON markdown block containing only the extracted value.`;
var GetPoolInfoAction = class {
  constructor(stakingProvider) {
    this.stakingProvider = stakingProvider;
  }
  async getPoolInfo(params) {
    elizaLogger12.log(`Fetching pool info for pool (${params.poolId})`);
    try {
      const poolInfo = await this.stakingProvider.getFormattedPoolInfo(
        params.poolId
      );
      return poolInfo;
    } catch (error) {
      throw new Error(`Fetching pool info failed: ${error.message}`);
    }
  }
};
var buildPoolInfoDetails = async (runtime, message, state) => {
  if (!state) {
    state = await runtime.composeState(message);
  } else {
    state = await runtime.updateRecentMessageState(state);
  }
  const poolInfoSchema = z.object({
    poolId: z.string()
  });
  const poolInfoContext = composeContext11({
    state,
    template: getPoolInfoTemplate
  });
  const content = await generateObject11({
    runtime,
    context: poolInfoContext,
    schema: poolInfoSchema,
    modelClass: ModelClass11.SMALL
  });
  return content.object;
};
var getPoolInfo_default = {
  name: "GET_POOL_INFO",
  similes: ["FETCH_POOL_INFO", "POOL_DATA", "GET_STAKING_INFO"],
  description: "Fetch detailed global staking pool information. Only perform if user is asking for a specific Pool Info, and NOT your stake.",
  handler: async (runtime, message, state, options, callback) => {
    elizaLogger12.log("Starting GET_POOL_INFO handler...");
    const poolInfoDetails = await buildPoolInfoDetails(
      runtime,
      message,
      state
    );
    if (!isPoolInfoContent(poolInfoDetails)) {
      elizaLogger12.error("Invalid content for GET_POOL_INFO action.");
      if (callback) {
        callback({
          text: "Invalid pool info details provided.",
          content: { error: "Invalid pool info content" }
        });
      }
      return false;
    }
    try {
      const stakingProvider = await initStakingProvider(runtime);
      const action = new GetPoolInfoAction(stakingProvider);
      const poolInfo = await action.getPoolInfo(poolInfoDetails);
      if (callback) {
        callback({
          text: `Successfully fetched pool info: 
${poolInfo}`,
          content: poolInfo
        });
      }
      return true;
    } catch (error) {
      elizaLogger12.error("Error fetching pool info:", error);
      if (callback) {
        callback({
          text: `Error fetching pool info: ${error.message}`,
          content: { error: error.message }
        });
      }
      return false;
    }
  },
  template: getPoolInfoTemplate,
  validate: async (runtime) => true,
  examples: [
    [
      {
        user: "{{user1}}",
        content: {
          text: "Get info for pool pool123",
          action: "GET_POOL_INFO"
        }
      },
      {
        user: "{{user2}}",
        content: {
          text: "Fetching pool info...",
          action: "GET_POOL_INFO"
        }
      },
      {
        user: "{{user2}}",
        content: {
          text: 'Fetched pool info for pool pool123: { "totalStaked": 1000, "rewardRate": 0.05, ...}'
        }
      }
    ]
  ]
};

// src/actions/batchTransfer.ts
import {
  elizaLogger as elizaLogger13,
  composeContext as composeContext12,
  generateObject as generateObject12,
  ModelClass as ModelClass12
} from "@elizaos/core";
import { Address as Address16, beginCell as beginCell10, internal as internal9, JettonMaster, SendMode as SendMode7, toNano as toNano7 } from "@ton/ton";
import { Builder as Builder2 } from "@ton/ton";
var transferItemSchema = z.object({
  type: z.enum(["ton", "token", "nft"]),
  recipientAddress: z.string().nonempty("Recipient address is required"),
  amount: z.string().optional(),
  tokenId: z.string().optional(),
  jettonMasterAddress: z.string().optional(),
  metadata: z.string().optional()
}).refine((data) => data.type === "ton" ? !!data.amount : true, {
  message: "Amount is required for TON transfers",
  path: ["amount"]
}).refine((data) => data.type === "token" ? !!data.jettonMasterAddress : true, {
  message: "jettonMasterAddress is required for token transfers",
  path: ["jettonMasterAddress"]
}).refine((data) => data.type === "token" ? !!data.amount : true, {
  message: "Amount is required for token transfers",
  path: ["amount"]
}).refine((data) => data.type === "nft" ? !!data.tokenId : true, {
  message: "tokenId is required for NFT transfers",
  path: ["tokenId"]
});
var batchTransferSchema = z.union([
  transferItemSchema,
  z.array(transferItemSchema)
]).transform((data) => {
  return Array.isArray(data) ? data : [data];
});
var batchTransferTemplate = `Return a JSON array for the transfer(s). The response should contain no schema information or additional properties.
  
  Example:
  [
    {
      "type": "ton",
      "recipientAddress": "address1",
      "amount": "1"
    },
    {
      "type": "token",
      "recipientAddress": "address2",
      "amount": "1",
      "jettonMasterAddress": "master1"
    },
    {
      "type": "nft",
      "recipientAddress": "address3",
      "tokenId": "nft1"
    }
  ]
  
  Rules:
  - Each recipient address should appear only once per asset type
  - Each token (jettonMasterAddress) should appear only once
  - Each NFT (tokenId) should appear only once
  - Do not create both NFT and token transfers for the same address
  - Amounts are required for TON and token transfers
  - JettonMasterAddress is required for token transfers
  - TokenId is required for NFT transfers
  
  {{recentMessages}}
  
  IMPORTANT: Return ONLY the transfer object(s) with no schema information or wrapper object.`;
function isBatchTransferContent(content) {
  if (Array.isArray(content)) {
    return content.every((transfer) => transferItemSchema.safeParse(transfer).success);
  }
  return transferItemSchema.safeParse(content).success;
}
function deduplicateTransfers(transfers) {
  const uniqueTransfers = /* @__PURE__ */ new Map();
  const processedRecipients = /* @__PURE__ */ new Map();
  for (const transfer of transfers) {
    let key;
    if (!processedRecipients.has(transfer.recipientAddress)) {
      processedRecipients.set(transfer.recipientAddress, /* @__PURE__ */ new Set());
    }
    const recipientTransfers = processedRecipients.get(transfer.recipientAddress);
    switch (transfer.type) {
      case "ton":
        key = `ton:${transfer.recipientAddress}`;
        break;
      case "token":
        if (recipientTransfers.has("token") || recipientTransfers.has("nft")) {
          continue;
        }
        key = `token:${transfer.jettonMasterAddress}`;
        break;
      case "nft":
        if (recipientTransfers.has("token") || recipientTransfers.has("nft")) {
          continue;
        }
        key = `nft:${transfer.tokenId}`;
        break;
      default:
        continue;
    }
    if (!uniqueTransfers.has(key)) {
      uniqueTransfers.set(key, transfer);
      recipientTransfers.add(transfer.type);
    }
  }
  const result = Array.from(uniqueTransfers.values());
  return result;
}
var BatchTransferAction = class {
  walletProvider;
  constructor(walletProvider) {
    this.walletProvider = walletProvider;
  }
  /**
   * Build a TON transfer message.
   */
  buildTonTransfer(item) {
    const message = internal9({
      to: Address16.parse(item.recipientAddress),
      value: toNano7(item.amount),
      bounce: true,
      body: ""
    });
    return {
      report: {
        type: item.type,
        recipientAddress: item.recipientAddress,
        amount: item.amount,
        status: "pending"
      },
      message
    };
  }
  /**
   * Build a token transfer message.
   */
  async buildTokenTransfer(item) {
    const tokenAddress = Address16.parse(item.jettonMasterAddress);
    const client = this.walletProvider.getWalletClient();
    const jettonMaster = client.open(JettonMaster.create(tokenAddress));
    const jettonWalletAddress = await jettonMaster.getWalletAddress(this.walletProvider.wallet.address);
    const forwardPayload = beginCell10().storeUint(0, 32).storeStringTail(item.metadata || "Hello, TON!").endCell();
    const tokenTransferBody = new Builder2().storeUint(260734629, 32).storeUint(0, 64).storeCoins(toNano7(item.amount)).storeAddress(Address16.parse(item.recipientAddress)).storeAddress(Address16.parse(item.recipientAddress)).storeBit(0).storeCoins(toNano7("0.02")).storeBit(1).storeRef(forwardPayload).endCell();
    const message = internal9({
      to: jettonWalletAddress,
      value: toNano7("0.1"),
      bounce: true,
      body: tokenTransferBody
    });
    const report = {
      report: {
        type: item.type,
        recipientAddress: item.recipientAddress,
        tokenId: item.tokenId,
        amount: item.amount,
        status: "pending"
      },
      message
    };
    return report;
  }
  /**
   * Build an NFT transfer message.
   */
  buildNftTransfer(item) {
    const nftTransferBody = beginCell10().storeUint(1607220500, 32).storeUint(0, 64).storeAddress(Address16.parse(item.recipientAddress)).storeAddress(this.walletProvider.wallet.address).storeMaybeRef(null).storeCoins(toNano7("0.01")).storeMaybeRef(null).endCell();
    const message = internal9({
      to: Address16.parse(item.tokenId),
      value: toNano7("0.05"),
      // Gas fee for the transfer
      bounce: true,
      body: nftTransferBody
    });
    return {
      message,
      report: {
        type: item.type,
        recipientAddress: item.recipientAddress,
        tokenId: item.tokenId,
        status: "pending"
      }
    };
  }
  async processTransferItem(item) {
    const recipientAddress = sanitizeTonAddress(item.recipientAddress);
    if (!recipientAddress) {
      throw new Error(`Invalid recipient address: ${item.recipientAddress}`);
    }
    item.recipientAddress = recipientAddress;
    if (item.type === "nft" && item.tokenId) {
      const tokenAddress = sanitizeTonAddress(item.tokenId);
      if (!tokenAddress) {
        throw new Error(`Invalid token address: ${item.tokenId}`);
      }
      item.tokenId = tokenAddress;
    }
    switch (item.type) {
      case "ton":
        return this.buildTonTransfer(item);
      case "token":
        elizaLogger13.debug(`Processing token transfer to ${recipientAddress} for token ${item.jettonMasterAddress}`);
        const result = await this.buildTokenTransfer(item);
        elizaLogger13.debug(`Token transfer build complete`);
        return result;
      case "nft":
        return this.buildNftTransfer(item);
      default:
        throw new Error(`Unsupported transfer type: ${item.type}`);
    }
  }
  async executeTransfer(messages, transferReports) {
    try {
      const walletClient = this.walletProvider.getWalletClient();
      const contract = walletClient.open(this.walletProvider.wallet);
      const seqno = await contract.getSeqno();
      await sleep(1500);
      const transfer = await contract.createTransfer({
        seqno,
        secretKey: this.walletProvider.keypair.secretKey,
        messages,
        sendMode: SendMode7.IGNORE_ERRORS + SendMode7.PAY_GAS_SEPARATELY
      });
      await sleep(1500);
      await contract.send(transfer);
      await waitSeqnoContract(seqno, contract);
      const state = await walletClient.getContractState(this.walletProvider.wallet.address);
      const { hash: lastHash } = state.lastTransaction;
      const txHash = base64ToHex(lastHash);
      elizaLogger13.log(JSON.stringify(transfer));
      transferReports.forEach((report) => {
        if (report.status === "pending") {
          report.status = "success";
        }
      });
      return txHash;
    } catch (error) {
      transferReports.forEach((report) => {
        if (report.status === "pending") {
          report.status = "failure";
          report.error = error.message;
        }
      });
      console.error(JSON.stringify(error));
      elizaLogger13.error("Error during batch transfer:", JSON.stringify(error));
      return null;
    }
  }
  /**
   * Creates a batch transfer based on an array of transfer items.
   * Each item is processed with a try/catch inside the for loop to ensure that individual errors
   * do not abort the entire batch.
   *
   * @param params - The batch transfer input parameters.
   * @returns An object with a detailed report for each transfer.
   */
  async createBatchTransfer(params) {
    const uniqueTransfers = deduplicateTransfers(params);
    const processResults = await Promise.all(
      uniqueTransfers.map(async (item) => {
        try {
          elizaLogger13.debug(`Processing transfer item of type ${item.type}`);
          const result = await this.processTransferItem(item);
          return {
            success: true,
            message: result.message,
            report: result.report
          };
        } catch (error) {
          elizaLogger13.error(`Error processing transfer: ${error.message}`);
          return {
            success: false,
            message: null,
            report: {
              type: item.type,
              recipientAddress: item.recipientAddress,
              amount: item.amount,
              tokenId: item.tokenId,
              status: "failure",
              error: error.message
            }
          };
        }
      })
    );
    const transferReports = [];
    const messages = [];
    processResults.forEach((result) => {
      if (result.success && result.message) {
        messages.push(result.message);
      }
      transferReports.push(result.report);
    });
    const hash = await this.executeTransfer(messages, transferReports);
    return { hash, reports: transferReports };
  }
};
var buildBatchTransferDetails = async (runtime, message, state) => {
  const walletInfo = await nativeWalletProvider.get(runtime, message, state);
  state.walletInfo = walletInfo;
  let currentState = state;
  if (!currentState) {
    currentState = await runtime.composeState(message);
  } else {
    currentState = await runtime.updateRecentMessageState(currentState);
  }
  const batchTransferContext = composeContext12({
    state,
    template: batchTransferTemplate
  });
  const content = await generateObject12({
    runtime,
    context: batchTransferContext,
    schema: batchTransferSchema,
    modelClass: ModelClass12.SMALL
  });
  let batchTransferContent = content.object;
  if (batchTransferContent === void 0) {
    batchTransferContent = content;
  }
  return batchTransferContent;
};
var batchTransfer_default = {
  name: "BATCH_TRANSFER",
  similes: ["BATCH_ASSET_TRANSFER", "MULTI_ASSET_TRANSFER"],
  description: "Creates a unified batch transfer for TON coins, tokens (e.g., Jettons), and NFTs. Supports flexible input parameters including recipient addresses, amounts, token identifiers, and optional metadata. Returns a detailed report summarizing the outcome for each transfer.",
  handler: async (runtime, message, state, options, callback) => {
    elizaLogger13.log("Starting BATCH_TRANSFER handler...");
    const details = await buildBatchTransferDetails(runtime, message, state);
    console.log(details);
    if (!isBatchTransferContent(details)) {
      console.error("Invalid content for BATCH_TRANSFER action.");
      if (callback) {
        callback({
          text: "Unable to process transfer request. Invalid content provided.",
          content: { error: "Invalid transfer content" }
        });
      }
      return false;
    }
    try {
      const walletProvider = await initWalletProvider(runtime);
      const batchTransferAction = new BatchTransferAction(walletProvider);
      const res = await batchTransferAction.createBatchTransfer(details);
      let text = "";
      const reports = res.reports;
      if (!res.hash) {
        const erroredReports = reports.filter((report) => report.error);
        erroredReports.forEach((report) => {
          text += `Error in transfer to ${report.recipientAddress}: ${report.error}

`;
        });
      }
      if (text === "") {
        text = `Batch transfer processed successfully. 

${reports.map((report) => `Transfer to ${report.recipientAddress} ${report.status === "success" ? "succeeded" : "failed"}`).join("\n")} 

Total transfers: ${reports.length} 

Transaction hash: ${res.hash}`;
      }
      if (callback) {
        callback({
          text,
          content: reports
        });
      }
    } catch (error) {
      elizaLogger13.error("Error in BATCH_TRANSFER handler:", error);
      if (callback) {
        callback({
          text: `Error in BATCH_TRANSFER: ${error.message}`,
          content: { error: error.message }
        });
      }
    }
    return true;
  },
  template: batchTransferTemplate,
  validate: async (_runtime) => true,
  examples: [
    [
      {
        user: "{{user1}}",
        content: {
          text: "Transfer 1 TON to 0QBLy_5Fr6f8NSpMt8SmPGiItnUE0JxgTJZ6m6E8aXoLtJHB and 1 SCALE token to 0QBLy_5Fr6f8NSpMt8SmPGiItnUE0JxgTJZ6m6E8aXoLtJHB",
          action: "BATCH_TRANSFER"
        }
      },
      {
        user: "{{user1}}",
        content: {
          text: "Batch transfer processed successfully"
        }
      }
    ]
  ]
};

// src/actions/auctionInteraction.ts
import {
  elizaLogger as elizaLogger14,
  composeContext as composeContext13,
  generateObject as generateObject13,
  ModelClass as ModelClass13
} from "@elizaos/core";
import { Address as Address18, internal as internal10, SendMode as SendMode8, toNano as toNano9 } from "@ton/ton";
import { Builder as Builder3 } from "@ton/ton";

// src/services/nft-marketplace/listingFactory.ts
import {
  Address as Address17,
  beginCell as beginCell11,
  Cell as Cell8,
  storeStateInit,
  toNano as toNano8
} from "@ton/ton";
async function buildNftFixPriceSaleV3R3DeploymentBody(cfg) {
  const NftFixPriceSaleV3R3CodeBoc = "te6ccgECDwEAA5MAART/APSkE/S88sgLAQIBYgIDAgLNBAUCASANDgL30A6GmBgLjYSS+CcH0gGHaiaGmAaY/9IH0gfSB9AGppj+mfmBg4KYVjgGAASpiFaY+F7xDhgEoYBWmfxwjFsxsLcxsrZBZjgsk5mW8oBfEV4ADJL4dwEuuk4QEWQIEV3RXgAJFZ2Ngp5OOC2HGBFWAA+WjKFkEINjYQQF1AYHAdFmCEAX14QBSYKBSML7y4cIk0PpA+gD6QPoAMFOSoSGhUIehFqBSkCH6RFtwgBDIywVQA88WAfoCy2rJcfsAJcIAJddJwgKwjhtQRSH6RFtwgBDIywVQA88WAfoCy2rJcfsAECOSNDTiWoMAGQwMWyy1DDQ0wchgCCw8tGVIsMAjhSBAlj4I1NBobwE+CMCoLkTsPLRlpEy4gHUMAH7AATwU8fHBbCOXRNfAzI3Nzc3BPoA+gD6ADBTIaEhocEB8tGYBdD6QPoA+kD6ADAwyDICzxZY+gIBzxZQBPoCyXAgEEgQNxBFEDQIyMsAF8sfUAXPFlADzxYBzxYB+gLMyx/LP8ntVOCz4wIwMTcowAPjAijAAOMCCMACCAkKCwCGNTs7U3THBZJfC+BRc8cF8uH0ghAFE42RGLry4fX6QDAQSBA3VTIIyMsAF8sfUAXPFlADzxYBzxYB+gLMyx/LP8ntVADiODmCEAX14QAYvvLhyVNGxwVRUscFFbHy4cpwIIIQX8w9FCGAEMjLBSjPFiH6Astqyx8Vyz8nzxYnzxYUygAj+gITygDJgwb7AHFwVBcAXjMQNBAjCMjLABfLH1AFzxZQA88WAc8WAfoCzMsfyz/J7VQAGDY3EDhHZRRDMHDwBQAgmFVEECQQI/AF4F8KhA/y8ADsIfpEW3CAEMjLBVADzxYB+gLLaslx+wBwIIIQX8w9FMjLH1Iwyz8kzxZQBM8WE8oAggnJw4D6AhLKAMlxgBjIywUnzxZw+gLLaswl+kRbyYMG+wBxVWD4IwEIyMsAF8sfUAXPFlADzxYBzxYB+gLMyx/LP8ntVACHvOFnaiaGmAaY/9IH0gfSB9AGppj+mfmC3ofSB9AH0gfQAYKaFQkNDggPlozJP9Ii2TfSItkf0iLcEIIySsKAVgAKrAQAgb7l72omhpgGmP/SB9IH0gfQBqaY/pn5gBaH0gfQB9IH0AGCmxUJDQ4ID5aM0U/SItlH0iLZH9Ii2F4ACFiBqqiU";
  const NftFixPriceSaleV3R3CodeCell = Cell8.fromBoc(
    Buffer.from(NftFixPriceSaleV3R3CodeBoc, "base64")
  )[0];
  const feesData = beginCell11().storeAddress(cfg.marketplaceFeeAddress).storeCoins(cfg.fullTonPrice / BigInt(100) * BigInt(5)).storeAddress(cfg.royaltyAddress).storeCoins(cfg.fullTonPrice / BigInt(100) * BigInt(0)).endCell();
  const saleData = beginCell11().storeBit(0).storeUint(Math.round(Date.now() / 1e3), 32).storeAddress(cfg.marketplaceAddress).storeAddress(cfg.nftAddress).storeAddress(cfg.nftOwnerAddress).storeCoins(cfg.fullTonPrice).storeRef(feesData).storeUint(0, 32).storeUint(0, 64).endCell();
  const stateInit = {
    code: NftFixPriceSaleV3R3CodeCell,
    data: saleData
  };
  const stateInitCell = beginCell11().store(storeStateInit(stateInit)).endCell();
  const saleContractAddress = new Address17(0, stateInitCell.hash());
  const saleBody = beginCell11().storeUint(1, 32).storeUint(0, 64).endCell();
  const transferNftBody = beginCell11().storeUint(1607220500, 32).storeUint(0, 64).storeAddress(cfg.deployerAddress).storeAddress(cfg.nftOwnerAddress).storeBit(0).storeCoins(toNano8("0.2")).storeBit(0).storeUint(16649950, 31).storeRef(stateInitCell).storeRef(saleBody).endCell();
  return transferNftBody;
}
async function buildNftAuctionV3R3DeploymentBody(cfg) {
  const NftAuctionV3R3CodeBoc = "te6ccgECJQEABucAART/APSkE/S88sgLAQIBIAIDAgFIBAUDZPLbPNs8MMACjqOBA/f4RMAA8vKBA+34QsD/8vKBA/L4I/hQufLy+FZ/2zz4AOCED/LwIg8VAgLMBgcCASAgIQIBIAgJACu78JsEIAvrwgFB8Jvwl0zJAMngB2wTAgEgCgsAN9QQgdzWUAKhAKCvgBqiGB+AGs0IDQ4IDIuHA4wCASAMDQIBIB4fBFEAdDTAwFxsPJA+kAw2zz4V1IQxwX4QsAAsI6EMzHbPOAh2zwhgQIruoCIODxAAEyCEDuaygABqYSABXDGBA+n4VtdJwgLy8oED6gHTH4IQBRONkRK6EvL0gEDXIfpAMPh2cPhif/hk2zwdALAgxwDA/5MwcCDg0x9wi2Y2FuY2VsgixwWTMXEy4ItHN0b3CCLHBZMxcjLgi2ZmluaXNogixwWTMXIy4ItmRlcGxveYIscFkzFzMuAh10nCP5Qw0z8wkTHiBPyOYltsIoED7PhCwP/4RMAAsfL0+EPHBfLhk9Qw0NMHgQP0IoAgsPLygQJYgQP1+CP4UCOhvPgj+FAkoLmw8vL4TsMAjheBA/X4I/hOI6G8+CP4TlAEoBO5ErDy8pEw4tQwAfsA4DMgwAHjAiDAAuMCwAOSXwTg+ETAAOMC+EIREhMUAY4wMTKBA+34I/hQvvLygQPt+ELA//LygQP3+ETAAPLygQPwAYIQBfXhALny8oED8fhNwgDy8vhWUhDHBfhDUiDHBbHy4ZPbPBgBjDAxMoED7fhCwP/y8oED9/hEwADy8oED8AGCEAX14QC58vKBA/L4I/hQufLy+FZSEMcF+ENSIMcFsfhMUiDHBbHy4ZNw2zwVAA5fBIED9/LwBO7A//gj+FC+sZdfBIED7fLw4PhS+FP4VPhV8ASBA/MBwADy8vhQ+COhgQP2AYIIGl4AvPLy+EqCEAX14QCgUjC++ErCALCPFTIC2zwg+Gz4Svht+CP4bgH4b3DbPOD4UPhRofgjuZf4UPhRoPhw3vhN4wPwDVIwuRwVFhcExvhNwACOm8D/jhT4J28iMIED6AGCEB3NZQC58vL4AN7bPODbPPhN+FL4U/AD+E34VPhV8AP4TSKhIaEFwP+OGIED6CWCEB3NZQC58vIEghAdzWUAofgABN4hwgCSMzDjDSHCABgjGRoBMjOBA+j4SVIwufLyAfhtAfhs+CP4bvhv2zwdAjKXXwSBA+jy8OAD2zwC+Gz4bfgj+G74b9s8HB0BfHAg+CWCEF/MPRTIyx/LP/hWzxZQA88WEssAIfoCywDJcYAYyMsF+FfPFnD6AstqzMmBAIL7AH/4Yn/4Zts8HQBWcCCAEMjLBVAGzxZQA/oCFMtqyx+L9NYXJrZXRwbGFjZSBmZWWM8WyXL7AAH8jiJwIIAQyMsFUAPPFlAD+gLLassfi3Um95YWx0eYzxbJcvsAkVviIMIAjiJwIIAQyMsF+FbPFlAD+gISy2rLH4tlByb2ZpdIzxbJcvsAkTDicCD4JYIQX8w9FMjLH8s/+EzPFlADzxYSywBx+gLLAMlxgBjIywX4V88WcPoCGwEky2rMyYEAgvsAf/hi+CP4cNs8HQDo+E3BAZEw4PhNgghVGSihIYIImJaAoVIQvJcwggiYloChkTHiIMIAjkiNClZb3VyIGJpZCBoYXMgYmVlbiBvdXRiaWQgYnkgYW5vdGhlciB1c2VyLoHAggBjIywX4TM8WUAT6AhPLahLLHwHPFsly+wCRMOIAdPhI+Ef4VfhU+FP4UvhP+FD4TvhG+ELIygDKAPhMzxb4TfoCyx/LH/hWzxbLP8sfyx/LH8sfzMzJ7VQAESCEDuaygCphIAAdCDAAJNfA3DgWfACAfABgAse84WbZ5tnnwpfCn8Knwq+AJAgfmA4AB5eUEEIKqh/CF8KHwh/Cv8K3wm/CZ8JfwpfCn8Knwq/CV8JPwi/Cd8IwiIiImIiIiICIkIiAeIiIeHCIgHCG+IZwheiFYITYhNCESIPEIiMC7b1Sjtnm2efCl8KfwqfCr4AkCB+YDgAHl5fCbhAEp4Bvw073wifCF8KHwh/Cv8K3wm/CZ8JfwpfCn8Knwq/CV8JPwi/Cd8I3wo/CeIiYiKiImIiQiKCIkIiIiJiIiIiAiJCIgHiIiHhwiIBwhviGcIXoheCFWITUIiMB9PhBbt3tRNDSAAH4YtIAAfhm+kAB+Gz6AAH4bdMfAfhu0x8B+HD6QAH4dtM/Afhv0x8B+HLTHwH4c9MfAfh00x8B+HX4VtdJwgL4ZNQB+GfUMPho+EjQ+kAB+GP6AAH4afoAAfhq0wYB+GvTEAH4cfpAAfh30x8w+GV/JAAQ+EfQ+kD6QDAABPhh";
  const NftAuctionV3R3CodeCell = Cell8.fromBoc(
    Buffer.from(NftAuctionV3R3CodeBoc, "base64")
  )[0];
  const royaltyAddress = cfg.nftOwnerAddress;
  const minPercentStep = 5;
  const stepTimeSeconds = 60 * 60 * 24;
  const createdAt = Math.round(Date.now() / 1e3);
  const constantData = beginCell11().storeAddress(cfg.marketplaceAddress).storeCoins(cfg.minimumBid).storeCoins(cfg.maximumBid).storeUint(minPercentStep, 7).storeUint(stepTimeSeconds, 17).storeAddress(cfg.nftAddress).storeUint(createdAt, 32).endCell();
  const feesData = beginCell11().storeAddress(cfg.marketplaceFeeAddress).storeAddress(cfg.royaltyAddress).endCell();
  const storage = beginCell11().storeBit(0).storeBit(0).storeBit(0).storeBit(0).storeCoins(0).storeUint(0, 32).storeUint(cfg.expiryTime, 32).storeAddress(cfg.nftOwnerAddress).storeUint(0, 64).storeUint(0, 32).storeUint(0, 32).storeUint(0, 32).storeUint(0, 32).storeRef(feesData).storeRef(constantData).endCell();
  const stateInit = {
    code: NftAuctionV3R3CodeCell,
    data: storage
  };
  const stateInitCell = beginCell11().store(storeStateInit(stateInit)).endCell();
  const saleContractAddress = new Address17(0, stateInitCell.hash());
  const saleBody = beginCell11().storeUint(3, 32).storeUint(0, 64).endCell();
  const transferNftBody = beginCell11().storeUint(1607220500, 32).storeUint(0, 64).storeAddress(cfg.deployerAddress).storeAddress(cfg.nftOwnerAddress).storeBit(0).storeCoins(toNano8("0.2")).storeBit(0).storeUint(16649950, 31).storeRef(stateInitCell).storeRef(saleBody).endCell();
  return transferNftBody;
}
var marketplaceAddress = Address17.parse(
  "EQBYTuYbLf8INxFtD8tQeNk5ZLy-nAX9ahQbG_yl1qQ-GEMS"
);
var marketplaceFeeAddress = Address17.parse(
  "EQCjk1hh952vWaE9bRguFkAhDAL5jj3xj9p0uPWrFBq_GEMS"
);
var destinationAddress = Address17.parse(
  "EQAIFunALREOeQ99syMbO6sSzM_Fa1RsPD5TBoS0qVeKQ-AR"
);

// src/actions/auctionInteraction.ts
var OP_CODES = {
  FIX_PRICE_BUY: 2n,
  FIX_PRICE_CANCEL: 3n,
  FIX_PRICE_CHANGE_PRICE: 0xfd135f7bn,
  OFFER_CANCEL: 3n
};
var auctionInteractionSchema = z.object({
  auctionAddress: z.string().nonempty("Auction address is required"),
  auctionAction: z.enum([
    "getAuctionData",
    "bid",
    "stop",
    "cancel",
    "list",
    "buy",
    "changePrice",
    "addValue",
    "cancelOffer",
    "getOfferData"
  ]),
  bidAmount: z.string().optional(),
  senderAddress: z.string().optional(),
  nftAddress: z.string().optional(),
  fullPrice: z.string().optional(),
  marketplaceAddress: z.string().optional(),
  marketplaceFeeAddress: z.string().optional(),
  marketplaceFeePercent: z.number().optional(),
  royaltyAddress: z.string().optional(),
  royaltyPercent: z.number().optional(),
  newPrice: z.string().optional(),
  additionalValue: z.string().optional()
}).refine(
  (data) => data.auctionAction !== "bid" || data.auctionAction === "bid" && data.bidAmount && data.senderAddress,
  {
    message: "For a bid action, bidAmount and senderAddress are required",
    path: ["bidAmount", "senderAddress"]
  }
).refine(
  (data) => (data.auctionAction === "stop" || data.auctionAction === "cancel") === false || !!data.senderAddress,
  {
    message: "For stop or cancel actions, senderAddress is required",
    path: ["senderAddress"]
  }
).refine(
  (data) => data.auctionAction !== "list" || data.auctionAction === "list" && data.nftAddress && data.fullPrice && data.marketplaceAddress && data.marketplaceFeeAddress && data.marketplaceFeePercent && data.royaltyAddress && data.royaltyPercent,
  {
    message: "For list action, all NFT sale parameters are required",
    path: ["nftAddress", "fullPrice", "marketplaceAddress"]
  }
).refine(
  (data) => data.auctionAction !== "changePrice" || data.auctionAction === "changePrice" && data.newPrice,
  {
    message: "For changePrice action, newPrice is required",
    path: ["newPrice"]
  }
).refine(
  (data) => data.auctionAction !== "addValue" || data.auctionAction === "addValue" && data.additionalValue,
  {
    message: "For addValue action, additionalValue is required",
    path: ["additionalValue"]
  }
);
function isAuctionInteractionContent(content) {
  return typeof content.auctionAddress === "string" && typeof content.auctionAction === "string";
}
var auctionInteractionTemplate = `Respond with a JSON markdown block containing only the extracted values. Use null for any values that cannot be determined.
Example response:
\`\`\`json
{
  "auctionAddress": "<Auction contract address>",
  "auctionAction": "<getAuctionData|bid|stop|cancel|list|buy|changePrice|addValue|cancelOffer|getOfferData>",
  "bidAmount": "<Bid amount in TON, required for 'bid' action>",
  "senderAddress": "<Sender's TON address, required for actions other than 'getAuctionData'>",
  "nftAddress": "<NFT address for listing>",
  "fullPrice": "<Full price in TON>",
  "marketplaceAddress": "<Marketplace address>",
  "marketplaceFeeAddress": "<Fee recipient address>",
  "marketplaceFeePercent": "<Marketplace fee percentage>",
  "royaltyAddress": "<Royalty recipient address>",
  "royaltyPercent": "<Royalty percentage>",
  "newPrice": "<New price in TON>",
  "additionalValue": "<Additional value for addValue action>"
}
\`\`\`

{{recentMessages}}

Respond with a JSON markdown block containing only the extracted values.`;
var buildAuctionInteractionData = async (runtime, message, state) => {
  const context = composeContext13({
    state,
    template: auctionInteractionTemplate
  });
  const content = await generateObject13({
    runtime,
    context,
    schema: auctionInteractionSchema,
    modelClass: ModelClass13.SMALL
  });
  return content.object;
};
var AuctionInteractionAction = class {
  walletProvider;
  constructor(walletProvider) {
    this.walletProvider = walletProvider;
  }
  /**
   * Retrieves auction sale data by calling the "get_auction_data" method on the auction contract.
   * The decoding here is demonstrative; actual fields depend on your auction contract's ABI.
   */
  async getAuctionData(auctionAddress) {
    const client = this.walletProvider.getWalletClient();
    const addr = Address18.parse(auctionAddress);
    const result = await client.runMethod(addr, "get_auction_data");
    try {
      const activated = result.stack.readNumber();
      const end = result.stack.readNumber();
      const end_time = result.stack.readNumber();
      const mp_addr = result.stack.readAddress()?.toString() || "";
      const nft_addr = result.stack.readAddress()?.toString() || "";
      let nft_owner;
      try {
        nft_owner = result.stack.readAddress()?.toString() || "";
      } catch (e) {
        nft_owner = "";
      }
      const last_bid = result.stack.readNumber();
      const last_member = result.stack.readAddress()?.toString() || "";
      const min_step = result.stack.readNumber();
      const mp_fee_addr = result.stack.readAddress()?.toString() || "";
      const mp_fee_factor = result.stack.readNumber();
      const mp_fee_base = result.stack.readNumber();
      const royalty_fee_addr = result.stack.readAddress()?.toString() || "";
      const royalty_fee_factor = result.stack.readNumber();
      const royalty_fee_base = result.stack.readNumber();
      const max_bid = result.stack.readNumber();
      const min_bid = result.stack.readNumber();
      let created_at = null;
      try {
        created_at = result.stack.readNumber();
      } catch (e) {
        created_at = null;
      }
      const last_bid_at = result.stack.readNumber();
      const is_canceled = result.stack.readNumber();
      const step_time = result.stack.readNumber();
      const last_query_id = result.stack.readNumber();
      return {
        auctionAddress,
        activated,
        end,
        end_time,
        mp_addr,
        nft_addr,
        nft_owner,
        last_bid,
        last_member,
        min_step,
        mp_fee_addr,
        mp_fee_factor,
        mp_fee_base,
        royalty_fee_addr,
        royalty_fee_factor,
        royalty_fee_base,
        max_bid,
        min_bid,
        created_at,
        last_bid_at,
        is_canceled,
        step_time,
        last_query_id,
        message: "Auction sale data fetched successfully"
      };
    } catch (parseError) {
      elizaLogger14.error("Error parsing sale data:", parseError);
      return { error: "Failed to parse sale data" };
    }
  }
  /**
   * Sends a bid by creating and sending an internal message with an empty bid body.
   */
  async bid(auctionAddress, bidAmount) {
    const auctionAddr = Address18.parse(auctionAddress);
    const bidMessage = internal10({
      to: auctionAddr,
      value: toNano9(bidAmount),
      bounce: true,
      body: ""
    });
    const contract = this.walletProvider.getWalletClient().open(this.walletProvider.wallet);
    const seqno = await contract.getSeqno();
    const transfer = await contract.createTransfer({
      seqno,
      secretKey: this.walletProvider.keypair.secretKey,
      messages: [bidMessage],
      sendMode: SendMode8.IGNORE_ERRORS + SendMode8.PAY_GAS_SEPARATELY
    });
    await contract.send(transfer);
    await waitSeqnoContract(seqno, contract);
    return {
      auctionAddress,
      bidAmount,
      message: "Bid placed successfully"
    };
  }
  /**
   * Sends a stop-auction message.
   */
  async stop(auctionAddress) {
    const client = this.walletProvider.getWalletClient();
    const contract = client.open(this.walletProvider.wallet);
    const seqno = await contract.getSeqno();
    const auctionAddr = Address18.parse(auctionAddress);
    const stopBody = new Builder3().storeUint(0, 32).storeBuffer(Buffer.from("stop")).endCell();
    const stopMessage = internal10({
      to: auctionAddr,
      value: toNano9("0.05"),
      bounce: true,
      body: stopBody
    });
    const transfer = await contract.createTransfer({
      seqno,
      secretKey: this.walletProvider.keypair.secretKey,
      messages: [stopMessage],
      sendMode: SendMode8.IGNORE_ERRORS + SendMode8.PAY_GAS_SEPARATELY
    });
    await contract.send(transfer);
    await waitSeqnoContract(seqno, contract);
    return {
      auctionAddress,
      message: "Stop auction message sent successfully"
    };
  }
  /**
   * Sends a cancel auction message using a placeholder opcode (0xDEADBEEF).
   */
  async cancel(auctionAddress) {
    const client = this.walletProvider.getWalletClient();
    const contract = client.open(this.walletProvider.wallet);
    const auctionAddr = Address18.parse(auctionAddress);
    const cancelBody = new Builder3().storeUint(0, 32).storeBuffer(Buffer.from("cancel")).endCell();
    const seqno = await contract.getSeqno();
    const cancelMessage = internal10({
      to: auctionAddr,
      value: toNano9("0.05"),
      bounce: true,
      body: cancelBody
    });
    const transfer = await contract.createTransfer({
      seqno,
      secretKey: this.walletProvider.keypair.secretKey,
      messages: [cancelMessage],
      sendMode: SendMode8.IGNORE_ERRORS + SendMode8.PAY_GAS_SEPARATELY
    });
    await contract.send(transfer);
    await waitSeqnoContract(seqno, contract);
    return {
      auctionAddress,
      message: "Cancel auction message sent successfully"
    };
  }
  /**
   * Lists an NFT for sale
   */
  async list(params) {
    const client = this.walletProvider.getWalletClient();
    const contract = client.open(this.walletProvider.wallet);
    const auctionAddr = Address18.parse(params.auctionAddress);
    const fullPrice = toNano9(params.fullPrice);
    const royalty = 5;
    const fee = 5;
    const saleData = {
      nftAddress: Address18.parse(params.nftAddress),
      nftOwnerAddress: this.walletProvider.wallet.address,
      deployerAddress: destinationAddress,
      marketplaceAddress,
      marketplaceFeeAddress,
      marketplaceFeePercent: fullPrice / BigInt(100) * BigInt(fee),
      royaltyAddress: this.walletProvider.wallet.address,
      royaltyPercent: fullPrice / BigInt(100) * BigInt(royalty),
      fullTonPrice: fullPrice
    };
    const saleBody = await buildNftFixPriceSaleV3R3DeploymentBody(saleData);
    const seqno = await contract.getSeqno();
    const listMessage = internal10({
      to: params.nftAddress,
      value: toNano9("0.3"),
      // Sufficient value for all operations
      bounce: true,
      body: saleBody
    });
    const transfer = await contract.sendTransfer({
      seqno,
      secretKey: this.walletProvider.keypair.secretKey,
      messages: [listMessage],
      sendMode: SendMode8.IGNORE_ERRORS + SendMode8.PAY_GAS_SEPARATELY
    });
    await waitSeqnoContract(seqno, contract);
    return {
      auctionAddress: params.auctionAddress,
      nftAddress: params.nftAddress,
      fullPrice: params.fullPrice,
      message: "NFT listed for sale successfully"
    };
  }
  /**
   * Buys an NFT from a fixed price sale contract
   */
  async buy(auctionAddress) {
    const client = this.walletProvider.getWalletClient();
    const contract = client.open(this.walletProvider.wallet);
    const addr = Address18.parse(auctionAddress);
    const result = await client.runMethod(addr, "get_fix_price_data_v4");
    const fullPrice = result.stack.readNumber();
    const minGasAmount = toNano9("0.1");
    const seqno = await contract.getSeqno();
    const buyMessage = internal10({
      to: addr,
      value: BigInt(fullPrice) + minGasAmount,
      bounce: true,
      body: new Builder3().storeUint(OP_CODES.FIX_PRICE_BUY, 32).endCell()
    });
    const transfer = await contract.createTransfer({
      seqno,
      secretKey: this.walletProvider.keypair.secretKey,
      messages: [buyMessage],
      sendMode: SendMode8.IGNORE_ERRORS + SendMode8.PAY_GAS_SEPARATELY
    });
    await contract.send(transfer);
    await waitSeqnoContract(seqno, contract);
    return {
      auctionAddress,
      price: fullPrice.toString(),
      message: "Buy message sent successfully"
    };
  }
  /**
   * Changes the price of a listed NFT
   */
  async changePrice(auctionAddress, newPrice) {
    const client = this.walletProvider.getWalletClient();
    const contract = client.open(this.walletProvider.wallet);
    const addr = Address18.parse(auctionAddress);
    const seqno = await contract.getSeqno();
    const changePriceMessage = internal10({
      to: addr,
      value: toNano9("0.05"),
      bounce: true,
      body: new Builder3().storeUint(OP_CODES.FIX_PRICE_CHANGE_PRICE, 32).storeCoins(toNano9(newPrice)).storeDict(void 0).endCell()
    });
    const transfer = await contract.createTransfer({
      seqno,
      secretKey: this.walletProvider.keypair.secretKey,
      messages: [changePriceMessage],
      sendMode: SendMode8.IGNORE_ERRORS + SendMode8.PAY_GAS_SEPARATELY
    });
    await contract.send(transfer);
    await waitSeqnoContract(seqno, contract);
    return {
      auctionAddress,
      newPrice,
      message: "Price changed successfully"
    };
  }
  /**
   * Adds value to an existing offer
   */
  async addValue(auctionAddress, additionalValue) {
    const client = this.walletProvider.getWalletClient();
    const contract = client.open(this.walletProvider.wallet);
    const addr = Address18.parse(auctionAddress);
    const seqno = await contract.getSeqno();
    const addValueMessage = internal10({
      to: addr,
      value: toNano9(additionalValue),
      bounce: true,
      body: new Builder3().storeUint(0, 32).endCell()
      // op = 0 for adding value
    });
    const transfer = await contract.createTransfer({
      seqno,
      secretKey: this.walletProvider.keypair.secretKey,
      messages: [addValueMessage],
      sendMode: SendMode8.IGNORE_ERRORS + SendMode8.PAY_GAS_SEPARATELY
    });
    await contract.send(transfer);
    await waitSeqnoContract(seqno, contract);
    return {
      auctionAddress,
      additionalValue,
      message: "Value added to offer successfully"
    };
  }
  /**
   * Cancels an NFT offer
   */
  async cancelOffer(auctionAddress) {
    const client = this.walletProvider.getWalletClient();
    const contract = client.open(this.walletProvider.wallet);
    const addr = Address18.parse(auctionAddress);
    const seqno = await contract.getSeqno();
    const cancelMessage = internal10({
      to: addr,
      value: toNano9("0.05"),
      bounce: true,
      body: new Builder3().storeUint(OP_CODES.OFFER_CANCEL, 32).endCell()
    });
    const transfer = await contract.createTransfer({
      seqno,
      secretKey: this.walletProvider.keypair.secretKey,
      messages: [cancelMessage],
      sendMode: SendMode8.IGNORE_ERRORS + SendMode8.PAY_GAS_SEPARATELY
    });
    await contract.send(transfer);
    await waitSeqnoContract(seqno, contract);
    return {
      auctionAddress,
      message: "Offer cancelled successfully"
    };
  }
  /**
   * Gets offer data
   */
  async getOfferData(auctionAddress) {
    const client = this.walletProvider.getWalletClient();
    const addr = Address18.parse(auctionAddress);
    const result = await client.runMethod(addr, "get_offer_data_v2");
    const magic = result.stack.readNumber();
    const isComplete = result.stack.readNumber();
    const createdAt = result.stack.readNumber();
    const finishAt = result.stack.readNumber();
    const swapAt = result.stack.readNumber();
    const marketplaceAddress2 = result.stack.readAddress();
    const nftAddress = result.stack.readAddress();
    const offerOwnerAddress = result.stack.readAddress();
    const fullPrice = result.stack.readNumber();
    const marketplaceFeeAddress2 = result.stack.readAddress();
    const marketplaceFactor = result.stack.readNumber();
    const marketplaceBase = result.stack.readNumber();
    const royaltyAddress = result.stack.readAddress();
    const royaltyFactor = result.stack.readNumber();
    const royaltyBase = result.stack.readNumber();
    const profitPrice = result.stack.readNumber();
    return {
      auctionAddress,
      isComplete: isComplete.toString(),
      createdAt: createdAt.toString(),
      finishAt: finishAt.toString(),
      swapAt: swapAt.toString(),
      marketplaceAddress: marketplaceAddress2?.toString() || "",
      nftAddress: nftAddress?.toString() || "",
      offerOwnerAddress: offerOwnerAddress?.toString() || "",
      fullPrice: fullPrice.toString(),
      marketplaceFeeAddress: marketplaceFeeAddress2?.toString() || "",
      marketplaceFactor: marketplaceFactor.toString(),
      marketplaceBase: marketplaceBase.toString(),
      royaltyAddress: royaltyAddress?.toString() || "",
      royaltyFactor: royaltyFactor.toString(),
      royaltyBase: royaltyBase.toString(),
      profitPrice: profitPrice.toString(),
      message: "Offer data fetched successfully"
    };
  }
};
var auctionInteraction_default = {
  name: "INTERACT_AUCTION",
  similes: ["AUCTION_INTERACT", "AUCTION_ACTION"],
  description: "Interacts with an auction contract. Supports actions: getSaleData, bid, stop, and cancel.",
  handler: async (runtime, message, state, options, callback) => {
    elizaLogger14.log("Starting INTERACT_AUCTION handler...");
    const params = await buildAuctionInteractionData(runtime, message, state);
    if (!isAuctionInteractionContent(params)) {
      if (callback) {
        callback({
          text: "Unable to process auction interaction request. Invalid content provided.",
          content: { error: "Invalid get auction interaction content" }
        });
      }
      return false;
    }
    try {
      const walletProvider = await initWalletProvider(runtime);
      const auctionAction = new AuctionInteractionAction(walletProvider);
      let result;
      switch (params.auctionAction) {
        case "getAuctionData":
          result = await auctionAction.getAuctionData(params.auctionAddress);
          break;
        case "bid":
          result = await auctionAction.bid(
            params.auctionAddress,
            params.bidAmount
          );
          break;
        case "stop":
          result = await auctionAction.stop(params.auctionAddress);
          break;
        case "cancel":
          result = await auctionAction.cancel(params.auctionAddress);
          break;
        case "list":
          result = await auctionAction.list(params);
          break;
        case "buy":
          result = await auctionAction.buy(params.auctionAddress);
          break;
        case "changePrice":
          result = await auctionAction.changePrice(
            params.auctionAddress,
            params.newPrice
          );
          break;
        case "addValue":
          result = await auctionAction.addValue(
            params.auctionAddress,
            params.additionalValue
          );
          break;
        case "cancelOffer":
          result = await auctionAction.cancelOffer(params.auctionAddress);
          break;
        case "getOfferData":
          result = await auctionAction.getOfferData(params.auctionAddress);
          break;
        default:
          throw new Error("Invalid auction action");
      }
      if (callback) {
        callback({
          text: JSON.stringify(result, null, 2),
          content: result
        });
      }
    } catch (error) {
      elizaLogger14.error("Error in INTERACT_AUCTION handler:", error);
      if (callback) {
        callback({
          text: `Error in INTERACT_AUCTION: ${error.message}`,
          content: { error: error.message }
        });
      }
    }
    return true;
  },
  template: auctionInteractionTemplate,
  // eslint-disable-next-line
  validate: async (_runtime) => {
    return true;
  },
  examples: [
    [
      {
        user: "{{user1}}",
        content: {
          auctionAddress: "EQAuctionAddressExample",
          auctionAction: "getAuctionData",
          action: "INTERACT_AUCTION"
        }
      },
      {
        user: "{{user1}}",
        content: {
          text: "Auction sale data fetched successfully"
        }
      }
    ],
    [
      {
        user: "{{user1}}",
        content: {
          auctionAddress: "EQAuctionAddressExample",
          auctionAction: "bid",
          bidAmount: "2",
          senderAddress: "EQBidderAddressExample",
          action: "INTERACT_AUCTION"
        }
      },
      {
        user: "{{user1}}",
        content: {
          text: "Bid placed successfully"
        }
      }
    ],
    [
      {
        user: "{{user1}}",
        content: {
          auctionAddress: "EQAuctionAddressExample",
          auctionAction: "stop",
          senderAddress: "EQOwnerAddressExample",
          action: "INTERACT_AUCTION"
        }
      },
      {
        user: "{{user1}}",
        content: {
          text: "Stop auction message sent successfully"
        }
      }
    ],
    [
      {
        user: "{{user1}}",
        content: {
          auctionAddress: "EQAuctionAddressExample",
          auctionAction: "cancel",
          senderAddress: "EQOwnerAddressExample",
          action: "INTERACT_AUCTION"
        }
      },
      {
        user: "{{user1}}",
        content: {
          text: "Cancel auction message sent successfully"
        }
      }
    ],
    [
      {
        user: "{{user1}}",
        content: {
          auctionAddress: "EQAuctionAddressExample",
          auctionAction: "list",
          nftAddress: "EQNftAddressExample",
          fullPrice: "10",
          marketplaceAddress: "EQMarketplaceAddressExample",
          marketplaceFeeAddress: "EQFeeAddressExample",
          marketplaceFeePercent: 5,
          royaltyAddress: "EQRoyaltyAddressExample",
          royaltyPercent: 2,
          action: "INTERACT_AUCTION"
        }
      },
      {
        user: "{{user1}}",
        content: {
          text: "NFT listed for sale successfully"
        }
      }
    ],
    [
      {
        user: "{{user1}}",
        content: {
          auctionAddress: "EQAuctionAddressExample",
          auctionAction: "buy",
          action: "INTERACT_AUCTION"
        }
      },
      {
        user: "{{user1}}",
        content: {
          text: "Buy message sent successfully"
        }
      }
    ],
    [
      {
        user: "{{user1}}",
        content: {
          auctionAddress: "EQAuctionAddressExample",
          auctionAction: "changePrice",
          newPrice: "15",
          action: "INTERACT_AUCTION"
        }
      },
      {
        user: "{{user1}}",
        content: {
          text: "Price changed successfully"
        }
      }
    ],
    [
      {
        user: "{{user1}}",
        content: {
          auctionAddress: "EQAuctionAddressExample",
          auctionAction: "addValue",
          additionalValue: "10",
          action: "INTERACT_AUCTION"
        }
      },
      {
        user: "{{user1}}",
        content: {
          text: "Value added to offer successfully"
        }
      }
    ],
    [
      {
        user: "{{user1}}",
        content: {
          auctionAddress: "EQAuctionAddressExample",
          auctionAction: "cancelOffer",
          action: "INTERACT_AUCTION"
        }
      },
      {
        user: "{{user1}}",
        content: {
          text: "Offer cancelled successfully"
        }
      }
    ],
    [
      {
        user: "{{user1}}",
        content: {
          auctionAddress: "EQAuctionAddressExample",
          auctionAction: "getOfferData",
          action: "INTERACT_AUCTION"
        }
      },
      {
        user: "{{user1}}",
        content: {
          text: "Offer data fetched successfully"
        }
      }
    ]
  ]
};

// src/actions/createListing.ts
import {
  elizaLogger as elizaLogger15,
  composeContext as composeContext14,
  generateObject as generateObject14,
  ModelClass as ModelClass14
} from "@elizaos/core";
import { Address as Address19, internal as internal11, SendMode as SendMode9, toNano as toNano10 } from "@ton/ton";
var CONFIG = {
  royaltyPercent: 5,
  marketplaceFeePercent: 5
};
var createListingSchema = z.object({
  nftAddress: z.string().nonempty("NFT address is required"),
  fullPrice: z.string().nonempty("Full price is required")
}).refine((data) => data.nftAddress && data.fullPrice, {
  message: "NFT address and full price are required",
  path: ["nftAddress", "fullPrice"]
});
function isCreateListingContent(content) {
  return typeof content.nftAddress === "string" && typeof content.fullPrice === "string";
}
var createListingTemplate = `Respond with a JSON markdown block containing only the extracted values.
Example response:
\`\`\`json
{
  "nftAddress": "<NFT address for listing>",
  "fullPrice": "<Full price in TON>"
}
\`\`\`

{{recentMessages}}

Respond with a JSON markdown block containing only the extracted values.`;
var buildCreateListingData = async (runtime, message, state) => {
  const context = composeContext14({
    state,
    template: createListingTemplate
  });
  const content = await generateObject14({
    runtime,
    context,
    schema: createListingSchema,
    modelClass: ModelClass14.SMALL
  });
  return content.object;
};
var CreateListingAction = class {
  walletProvider;
  constructor(walletProvider) {
    this.walletProvider = walletProvider;
  }
  /**
   * Lists an NFT for sale using default marketplace configuration
   */
  async list(params) {
    const client = this.walletProvider.getWalletClient();
    const contract = client.open(this.walletProvider.wallet);
    const fullPrice = toNano10(params.fullPrice);
    const royalty = CONFIG.royaltyPercent;
    const fee = CONFIG.marketplaceFeePercent;
    const saleData = {
      nftAddress: Address19.parse(params.nftAddress),
      nftOwnerAddress: this.walletProvider.wallet.address,
      deployerAddress: destinationAddress,
      marketplaceAddress,
      marketplaceFeeAddress,
      marketplaceFeePercent: fullPrice / BigInt(100) * BigInt(fee),
      royaltyAddress: this.walletProvider.wallet.address,
      // Using wallet address as royalty recipient
      royaltyPercent: fullPrice / BigInt(100) * BigInt(royalty),
      fullTonPrice: fullPrice
    };
    const saleBody = await buildNftFixPriceSaleV3R3DeploymentBody(saleData);
    const seqno = await contract.getSeqno();
    const listMessage = internal11({
      to: params.nftAddress,
      value: toNano10("0.3"),
      // Sufficient value for all operations
      bounce: true,
      body: saleBody
    });
    const transfer = await contract.sendTransfer({
      seqno,
      secretKey: this.walletProvider.keypair.secretKey,
      messages: [listMessage],
      sendMode: SendMode9.IGNORE_ERRORS + SendMode9.PAY_GAS_SEPARATELY
    });
    await waitSeqnoContract(seqno, contract);
    return {
      nftAddress: params.nftAddress,
      fullPrice: params.fullPrice,
      message: "NFT listed for sale successfully",
      marketplaceFee: `${fee}%`,
      royaltyFee: `${royalty}%`
    };
  }
};
var createListing_default = {
  name: "CREATE_LISTING",
  similes: ["NFT_LISTING", "LIST_NFT", "SELL_NFT"],
  description: "Creates a listing for an NFT by sending the appropriate message to the NFT contract. Only requires NFT address and price.",
  handler: async (runtime, message, state, options, callback) => {
    elizaLogger15.log("Starting CREATE_LISTING handler...");
    const params = await buildCreateListingData(runtime, message, state);
    if (!isCreateListingContent(params)) {
      if (callback) {
        callback({
          text: "Unable to process create listing request. Invalid content provided.",
          content: { error: "Invalid create listing content" }
        });
      }
      return false;
    }
    try {
      const walletProvider = await initWalletProvider(runtime);
      const createListingAction = new CreateListingAction(walletProvider);
      const result = await createListingAction.list(params);
      if (callback) {
        callback({
          text: JSON.stringify(result, null, 2),
          content: result
        });
      }
    } catch (error) {
      elizaLogger15.error("Error in CREATE_LISTING handler:", error);
      if (callback) {
        callback({
          text: `Error in CREATE_LISTING: ${error.message}`,
          content: { error: error.message }
        });
      }
    }
    return true;
  },
  template: createListingTemplate,
  // eslint-disable-next-line
  validate: async (_runtime) => {
    return true;
  },
  examples: [
    [
      {
        user: "{{user1}}",
        content: {
          nftAddress: "EQNftAddressExample",
          fullPrice: "10",
          action: "CREATE_LISTING"
        }
      },
      {
        user: "{{user1}}",
        content: {
          text: "NFT listed for sale successfully"
        }
      }
    ]
  ]
};

// src/actions/buyListing.ts
import {
  elizaLogger as elizaLogger16,
  composeContext as composeContext15,
  generateObject as generateObject15,
  ModelClass as ModelClass15
} from "@elizaos/core";

// src/services/nft-marketplace/listingTransactions.ts
import { beginCell as beginCell14, internal as internal13, SendMode as SendMode11, toNano as toNano11 } from "@ton/ton";

// src/utils/NFTItem.ts
import {
  Address as Address20,
  beginCell as beginCell13,
  internal as internal12,
  SendMode as SendMode10
} from "@ton/ton";
async function getAddressByIndex(client, collectionAddress, itemIndex) {
  const response = await client.runMethod(
    collectionAddress,
    "get_nft_address_by_index",
    [{ type: "int", value: BigInt(itemIndex) }]
  );
  return response.stack.readAddress();
}
async function getNftOwner(walletProvider, nftAddress) {
  try {
    const client = walletProvider.getWalletClient();
    const result = await client.runMethod(
      Address20.parse(nftAddress),
      "get_nft_data"
    );
    result.stack.skip(3);
    const owner = result.stack.readAddress();
    const rawString = owner.toRawString();
    const operationalAddress = Address20.parseRaw(rawString);
    return operationalAddress;
  } catch (error) {
    throw new Error(`Failed to get NFT owner: ${error.message}`);
  }
}
var NftItem = class {
  collectionAddress;
  constructor(collection) {
    this.collectionAddress = Address20.parse(collection);
  }
  createMintBody(params) {
    const body = beginCell13();
    body.storeUint(1, 32);
    body.storeUint(params.queryId || 0, 64);
    body.storeUint(params.itemIndex, 64);
    body.storeCoins(params.amount);
    const nftItemContent = beginCell13();
    nftItemContent.storeAddress(params.itemOwnerAddress);
    const uriContent = beginCell13();
    uriContent.storeBuffer(Buffer.from(params.commonContentUrl));
    nftItemContent.storeRef(uriContent.endCell());
    body.storeRef(nftItemContent.endCell());
    return body.endCell();
  }
  async deploy(walletProvider, params) {
    const walletClient = walletProvider.getWalletClient();
    const contract = walletClient.open(walletProvider.wallet);
    const seqno = await contract.getSeqno();
    await contract.sendTransfer({
      seqno,
      secretKey: walletProvider.keypair.secretKey,
      messages: [
        internal12({
          value: "0.05",
          to: this.collectionAddress,
          body: this.createMintBody(params)
        })
      ],
      sendMode: SendMode10.IGNORE_ERRORS + SendMode10.PAY_GAS_SEPARATELY
    });
    return seqno;
  }
};

// src/services/nft-marketplace/interfaces/listings.ts
function parseFixedPriceDataFromStack(stack) {
  return {
    magic: stack.readNumber(),
    isComplete: stack.readBoolean(),
    createdAt: stack.readNumber(),
    marketplace: stack.readAddress(),
    nft: stack.readAddress(),
    owner: stack.readAddress(),
    fullPrice: stack.readBigNumber(),
    marketFeeAddress: stack.readAddress(),
    marketFee: stack.readBigNumber(),
    royaltyAddress: stack.readAddress(),
    royaltyAmount: stack.readBigNumber()
  };
}
function parseAuctionDataFromStack(stack) {
  return {
    magic: stack.readNumber(),
    end: stack.readBoolean(),
    endTime: stack.readNumber(),
    marketplace: stack.readAddress(),
    nft: stack.readAddress(),
    owner: stack.readAddress(),
    lastBid: stack.readBigNumber(),
    lastMember: stack.readAddressOpt(),
    minStep: stack.readNumber(),
    marketFeeAddress: stack.readAddress(),
    mpFeeFactor: stack.readNumber(),
    mpFeeBase: stack.readNumber(),
    royaltyAddress: stack.readAddress(),
    royaltyFeeFactor: stack.readNumber(),
    royaltyFeeBase: stack.readNumber(),
    maxBid: stack.readBigNumber(),
    minBid: stack.readBigNumber(),
    createdAt: stack.readNumber(),
    lastBidAt: stack.readNumber(),
    isCanceled: stack.readBoolean()
  };
}

// src/services/nft-marketplace/listingData.ts
function isAuction(stack) {
  return stack.remaining === 20;
}
async function getListingData(walletProvider, nftAddress) {
  try {
    const listingAddress = await getNftOwner(walletProvider, nftAddress);
    const client = walletProvider.getWalletClient();
    const result = await client.runMethod(listingAddress, "get_sale_data");
    if (!isAuction(result.stack)) {
      return parseFixedPriceData(listingAddress, result.stack);
    } else {
      return parseAuctionData(listingAddress, result.stack);
    }
  } catch (error) {
    throw new Error(`Failed to get listing data: ${error.message}`);
  }
}
function parseFixedPriceData(listingAddress, stack) {
  const fullData = parseFixedPriceDataFromStack(stack);
  return {
    listingAddress,
    owner: fullData.owner,
    fullPrice: fullData.fullPrice,
    isAuction: false
  };
}
function parseAuctionData(listingAddress, stack) {
  const fullData = parseAuctionDataFromStack(stack);
  return {
    listingAddress,
    owner: fullData.owner,
    fullPrice: fullData.maxBid,
    // Max bid serves as the "buy now" price
    minBid: fullData.minBid,
    lastBid: fullData.lastBid,
    maxBid: fullData.maxBid,
    endTime: fullData.endTime,
    isAuction: true
  };
}
async function getAuctionData(walletProvider, nftAddress) {
  try {
    const listingAddress = await getNftOwner(walletProvider, nftAddress);
    const client = walletProvider.getWalletClient();
    const result = await client.runMethod(listingAddress, "get_sale_data");
    if (!isAuction(result.stack)) {
      throw new Error("Not an auction listing");
    }
    const data = parseAuctionDataFromStack(result.stack);
    return {
      ...data,
      listingAddress
    };
  } catch (error) {
    throw new Error(`Failed to get auction data: ${error.message}`);
  }
}
async function getBuyPrice(walletProvider, nftAddress) {
  const listingData = await getListingData(walletProvider, nftAddress);
  return listingData.fullPrice;
}
async function getMinBid(walletProvider, nftAddress) {
  const listingData = await getListingData(walletProvider, nftAddress);
  if (!listingData.isAuction) {
    throw new Error("Not an auction listing");
  }
  return listingData.minBid;
}
async function isAuctionEnded(walletProvider, nftAddress) {
  const listingData = await getListingData(walletProvider, nftAddress);
  if (!listingData.isAuction) {
    throw new Error("Not an auction listing");
  }
  const now = Math.floor(Date.now() / 1e3);
  return now > listingData.endTime;
}
async function getNextValidBidAmount(walletProvider, nftAddress) {
  const listingData = await getListingData(walletProvider, nftAddress);
  if (!listingData.isAuction) {
    throw new Error("Not an auction listing");
  }
  if (listingData.lastBid === BigInt(0)) {
    return listingData.minBid;
  }
  const auctionData = await getAuctionData(walletProvider, nftAddress);
  const minIncrement = listingData.lastBid * BigInt(auctionData.minStep) / BigInt(100);
  return listingData.lastBid + minIncrement;
}

// src/services/nft-marketplace/listingTransactions.ts
async function buyListing(walletProvider, nftAddress) {
  try {
    const { listingAddress } = await getListingData(walletProvider, nftAddress);
    const fullPrice = await getBuyPrice(walletProvider, nftAddress);
    const gasAmount = toNano11("1");
    const amountToSend = fullPrice + gasAmount;
    const client = walletProvider.getWalletClient();
    const contract = client.open(walletProvider.wallet);
    const seqno = await contract.getSeqno();
    const transferMessage = internal13({
      to: listingAddress,
      value: amountToSend,
      bounce: true,
      body: ""
      // Empty body for default buy operation
    });
    await contract.sendTransfer({
      seqno,
      secretKey: walletProvider.keypair.secretKey,
      messages: [transferMessage],
      sendMode: SendMode11.IGNORE_ERRORS + SendMode11.PAY_GAS_SEPARATELY
    });
    await waitSeqnoContract(seqno, contract);
    return {
      nftAddress,
      listingAddress: listingAddress.toString(),
      price: fullPrice.toString(),
      message: "Buy transaction sent successfully"
    };
  } catch (error) {
    throw new Error(`Failed to buy NFT: ${error.message}`);
  }
}
async function cancelListing(walletProvider, nftAddress) {
  try {
    const listingData = await getListingData(walletProvider, nftAddress);
    const opcode = listingData.isAuction ? 1 : 3;
    const msgBody = beginCell14().storeUint(opcode, 32).storeUint(0, 64).endCell();
    const gasAmount = toNano11("0.2");
    const client = walletProvider.getWalletClient();
    const contract = client.open(walletProvider.wallet);
    const seqno = await contract.getSeqno();
    const transferMessage = internal13({
      to: listingData.listingAddress,
      value: gasAmount,
      bounce: true,
      body: msgBody
    });
    await contract.sendTransfer({
      seqno,
      secretKey: walletProvider.keypair.secretKey,
      messages: [transferMessage],
      sendMode: SendMode11.IGNORE_ERRORS + SendMode11.PAY_GAS_SEPARATELY
    });
    await waitSeqnoContract(seqno, contract);
    return {
      nftAddress,
      listingAddress: listingData.listingAddress.toString(),
      message: "Cancel listing transaction sent successfully"
    };
  } catch (error) {
    throw new Error(`Failed to cancel NFT listing: ${error.message}`);
  }
}
async function bidOnAuction(walletProvider, nftAddress, bidAmount) {
  try {
    const listingData = await getListingData(walletProvider, nftAddress);
    if (!listingData.isAuction) {
      throw new Error("Cannot bid on a fixed-price listing. Use buyListing instead.");
    }
    const auctionEnded = await isAuctionEnded(walletProvider, nftAddress);
    if (auctionEnded) {
      throw new Error("Auction has already ended.");
    }
    const bid = bidAmount;
    const minBid = await getMinBid(walletProvider, nftAddress);
    if (bid < minBid) {
      throw new Error(`Bid too low. Minimum bid is ${minBid.toString()}.`);
    }
    const gasAmount = toNano11("0.1");
    const amountToSend = bid + gasAmount;
    const client = walletProvider.getWalletClient();
    const contract = client.open(walletProvider.wallet);
    const seqno = await contract.getSeqno();
    const transferMessage = internal13({
      to: listingData.listingAddress,
      value: amountToSend,
      bounce: true,
      body: ""
    });
    await contract.sendTransfer({
      seqno,
      secretKey: walletProvider.keypair.secretKey,
      messages: [transferMessage],
      sendMode: SendMode11.IGNORE_ERRORS + SendMode11.PAY_GAS_SEPARATELY
    });
    await waitSeqnoContract(seqno, contract);
    return {
      nftAddress,
      listingAddress: listingData.listingAddress.toString(),
      bidAmount: bid.toString(),
      message: "Bid placed successfully"
    };
  } catch (error) {
    throw new Error(`Failed to place bid: ${error.message}`);
  }
}

// src/actions/buyListing.ts
var buyListingSchema = z.object({
  nftAddress: z.string().nonempty("NFT address is required")
}).refine(
  (data) => data.nftAddress,
  {
    message: "NFT address is required",
    path: ["nftAddress"]
  }
);
function isBuyListingContent(content) {
  return typeof content.nftAddress === "string";
}
var buyListingTemplate = `Respond with a JSON markdown block containing only the extracted values.
  Example response:
  \`\`\`json
  {
    "nftAddress": "<NFT address to buy>"
  }
  \`\`\`

  {{recentMessages}}

  Respond with a JSON markdown block containing only the extracted values.`;
var buildBuyListingData = async (runtime, message, state) => {
  const context = composeContext15({
    state,
    template: buyListingTemplate
  });
  const content = await generateObject15({
    runtime,
    context,
    schema: buyListingSchema,
    modelClass: ModelClass15.SMALL
  });
  return content.object;
};
var BuyListingAction = class {
  walletProvider;
  constructor(walletProvider) {
    this.walletProvider = walletProvider;
  }
  /**
   * Buys an NFT listing
   */
  async buy(nftAddress) {
    try {
      elizaLogger16.log(`Starting purchase of NFT: ${nftAddress}`);
      const receipt = await buyListing(this.walletProvider, nftAddress);
      return receipt;
    } catch (error) {
      elizaLogger16.error(`Error buying NFT ${nftAddress}: ${error}`);
      throw new Error(`Failed to buy NFT: ${error.message}`);
    }
  }
};
var buyListing_default = {
  name: "BUY_LISTING",
  similes: ["NFT_BUY", "PURCHASE_NFT", "BUY_NFT"],
  description: "Buys a listed NFT by sending the required payment to the listing contract.",
  handler: async (runtime, message, state, options, callback) => {
    elizaLogger16.log("Starting BUY_LISTING handler...");
    const params = await buildBuyListingData(runtime, message, state);
    if (!isBuyListingContent(params)) {
      if (callback) {
        callback({
          text: "Unable to process buy listing request. Invalid content provided.",
          content: { error: "Invalid buy listing content" }
        });
      }
      return false;
    }
    try {
      const walletProvider = await initWalletProvider(runtime);
      const buyListingAction = new BuyListingAction(walletProvider);
      const result = await buyListingAction.buy(params.nftAddress);
      if (callback) {
        callback({
          text: JSON.stringify(result, null, 2),
          content: result
        });
      }
    } catch (error) {
      elizaLogger16.error("Error in BUY_LISTING handler:", error);
      if (callback) {
        callback({
          text: `Error in BUY_LISTING: ${error.message}`,
          content: { error: error.message }
        });
      }
    }
    return true;
  },
  template: buyListingTemplate,
  // eslint-disable-next-line
  validate: async (_runtime) => {
    return true;
  },
  examples: [
    [
      {
        user: "{{user1}}",
        content: {
          nftAddress: "EQNftAddressExample",
          action: "BUY_LISTING"
        }
      },
      {
        user: "{{user1}}",
        content: {
          text: "Buy transaction sent successfully"
        }
      }
    ]
  ]
};

// src/actions/createAuction.ts
import {
  elizaLogger as elizaLogger17,
  composeContext as composeContext16,
  generateObject as generateObject16,
  ModelClass as ModelClass16
} from "@elizaos/core";
import { Address as Address21, internal as internal14, SendMode as SendMode12, toNano as toNano12 } from "@ton/ton";
var CONFIG2 = {
  royaltyPercent: 5,
  marketplaceFeePercent: 5
};
var createAuctionSchema = z.object({
  nftAddress: z.string().nonempty("NFT address is required"),
  minimumBid: z.string().nonempty("Minimum bid is required"),
  maximumBid: z.string().nonempty("Maximum bid (buyout price) is required"),
  expiryTime: z.string().nonempty("Expiry time is required")
}).refine((data) => data.nftAddress && data.minimumBid && data.maximumBid && data.expiryTime, {
  message: "NFT address, minimum bid, maximum bid, and expiry time are required",
  path: ["nftAddress", "minimumBid", "maximumBid", "expiryTime"]
});
function isCreateAuctionContent(content) {
  return typeof content.nftAddress === "string" && typeof content.minimumBid === "string" && typeof content.maximumBid === "string" && typeof content.expiryTime === "string";
}
var createAuctionTemplate = `Respond with a JSON markdown block containing only the extracted values.
  Example response:
  \`\`\`json
  {
    "nftAddress": "<NFT address for auction>",
    "minimumBid": "<Minimum bid in TON>",
    "maximumBid": "<Maximum bid/buyout price in TON>",
    "expiryTime": "<Auction expiry time in hours>"
  }
  \`\`\`

  {{recentMessages}}
  If a parameter is missing, respond with a question asking specifically for that parameter.
  Respond with a JSON markdown block containing only the extracted values.`;
var buildCreateAuctionData = async (runtime, message, state) => {
  const context = composeContext16({
    state,
    template: createAuctionTemplate
  });
  const content = await generateObject16({
    runtime,
    context,
    schema: createAuctionSchema,
    modelClass: ModelClass16.SMALL
  });
  return content.object;
};
var CreateAuctionAction = class {
  walletProvider;
  constructor(walletProvider) {
    this.walletProvider = walletProvider;
  }
  /**
   * Creates an auction for an NFT using default marketplace configuration
   */
  async createAuction(params) {
    const client = this.walletProvider.getWalletClient();
    const contract = client.open(this.walletProvider.wallet);
    elizaLogger17.info("Creating auction with params: ", params);
    const minimumBid = toNano12(params.minimumBid);
    const maximumBid = toNano12(params.maximumBid);
    const expiryTime = Math.floor(Date.now() / 1e3) + parseInt(params.expiryTime) * 3600;
    const royalty = CONFIG2.royaltyPercent;
    const fee = CONFIG2.marketplaceFeePercent;
    const auctionData = {
      nftAddress: Address21.parse(params.nftAddress),
      nftOwnerAddress: this.walletProvider.wallet.address,
      deployerAddress: destinationAddress,
      marketplaceAddress,
      marketplaceFeeAddress,
      marketplaceFeePercent: maximumBid / BigInt(100) * BigInt(fee),
      royaltyAddress: this.walletProvider.wallet.address,
      // Using wallet address as royalty recipient
      royaltyPercent: maximumBid / BigInt(100) * BigInt(royalty),
      minimumBid,
      maximumBid,
      expiryTime
    };
    elizaLogger17.info("Minbid: ", minimumBid);
    const auctionBody = await buildNftAuctionV3R3DeploymentBody(auctionData);
    const seqno = await contract.getSeqno();
    const auctionMessage = internal14({
      to: params.nftAddress,
      value: toNano12("0.5"),
      // Increased value for auction operations
      bounce: true,
      body: auctionBody
    });
    const transfer = await contract.sendTransfer({
      seqno,
      secretKey: this.walletProvider.keypair.secretKey,
      messages: [auctionMessage],
      sendMode: SendMode12.IGNORE_ERRORS + SendMode12.PAY_GAS_SEPARATELY
    });
    await waitSeqnoContract(seqno, contract);
    return {
      nftAddress: params.nftAddress,
      minimumBid: params.minimumBid,
      maximumBid: params.maximumBid,
      expiryTime: params.expiryTime,
      message: "NFT auction created successfully",
      marketplaceFee: `${fee}%`,
      royaltyFee: `${royalty}%`,
      expiryTimestamp: new Date(Number(expiryTime) * 1e3).toISOString()
    };
  }
};
var createAuction_default = {
  name: "CREATE_AUCTION",
  similes: ["NFT_AUCTION", "AUCTION_NFT", "START_AUCTION"],
  description: "Creates an auction for an NFT by sending the appropriate message to the NFT contract. Requires NFT address, minimum bid, maximum bid (buyout price), and auction expiry time in hours.",
  handler: async (runtime, message, state, options, callback) => {
    elizaLogger17.log("Starting CREATE_AUCTION handler...");
    const params = await buildCreateAuctionData(runtime, message, state);
    if (!isCreateAuctionContent(params)) {
      if (callback) {
        callback({
          text: "Unable to process create auction request. Invalid content provided.",
          content: { error: "Invalid create auction content" }
        });
      }
      return false;
    }
    try {
      const walletProvider = await initWalletProvider(runtime);
      const createAuctionAction = new CreateAuctionAction(walletProvider);
      const result = await createAuctionAction.createAuction(params);
      if (callback) {
        callback({
          text: JSON.stringify(result, null, 2),
          content: result
        });
      }
    } catch (error) {
      elizaLogger17.error("Error in CREATE_AUCTION handler:", error);
      if (callback) {
        callback({
          text: `Error in CREATE_AUCTION: ${error.message}`,
          content: { error: error.message }
        });
      }
    }
    return true;
  },
  template: createAuctionTemplate,
  // eslint-disable-next-line
  validate: async (_runtime) => {
    return true;
  },
  examples: [
    [
      {
        user: "{{user1}}",
        content: {
          nftAddress: "EQNftAddressExample",
          minimumBid: "5",
          maximumBid: "20",
          expiryTime: "48",
          action: "CREATE_AUCTION"
        }
      },
      {
        user: "{{user1}}",
        content: {
          text: "NFT auction created successfully"
        }
      }
    ]
  ]
};

// src/actions/bidListing.ts
import {
  elizaLogger as elizaLogger18,
  composeContext as composeContext17,
  generateObject as generateObject17,
  ModelClass as ModelClass17
} from "@elizaos/core";
import { toNano as toNano13 } from "@ton/ton";
var bidAuctionSchema = z.object({
  nftAddress: z.string().nonempty("NFT address is required"),
  bidAmount: z.string().optional()
}).refine(
  (data) => data.nftAddress,
  {
    message: "NFT address is required",
    path: ["nftAddress"]
  }
);
function isBidAuctionContent(content) {
  return typeof content.nftAddress === "string";
}
var bidAuctionTemplate = `Respond with a JSON markdown block containing only the extracted values.
  Example response:
  \`\`\`json
  {
    "nftAddress": "<NFT address to bid on>",
    "bidAmount": "<optional bid amount in TON>"
  }
  \`\`\`

  {{recentMessages}}

  If no bid amount is provided, make bidAmount null or omit it.
  Respond with a JSON markdown block containing only the extracted values.`;
var buildBidAuctionData = async (runtime, message, state) => {
  const context = composeContext17({
    state,
    template: bidAuctionTemplate
  });
  const content = await generateObject17({
    runtime,
    context,
    schema: bidAuctionSchema,
    modelClass: ModelClass17.SMALL
  });
  return content.object;
};
var BidAuctionAction = class {
  walletProvider;
  constructor(walletProvider) {
    this.walletProvider = walletProvider;
  }
  /**
   * Validates whether the auction is valid for bidding
   */
  async validateAuction(nftAddress) {
    try {
      const auctionEnded = await isAuctionEnded(this.walletProvider, nftAddress);
      if (auctionEnded) {
        return { valid: false, message: "This auction has already ended" };
      }
      return { valid: true };
    } catch (error) {
      if (error.message.includes("Not an auction listing")) {
        return { valid: false, message: "This is not an auction. Please use BUY_LISTING instead" };
      }
      throw error;
    }
  }
  /**
   * Places a bid on an NFT auction
   */
  async bid(nftAddress, bidAmount) {
    try {
      elizaLogger18.log(`Starting bid process for NFT: ${nftAddress}`);
      const validationResult = await this.validateAuction(nftAddress);
      if (!validationResult.valid) {
        throw new Error(validationResult.message);
      }
      let amount;
      if (!bidAmount) {
        amount = await getNextValidBidAmount(this.walletProvider, nftAddress);
      } else {
        amount = toNano13(bidAmount);
      }
      const receipt = await bidOnAuction(this.walletProvider, nftAddress, amount);
      return receipt;
    } catch (error) {
      elizaLogger18.error(`Error bidding on NFT ${nftAddress}: ${error}`);
      throw new Error(`Failed to bid on NFT: ${error.message}`);
    }
  }
};
var bidListing_default = {
  name: "BID_AUCTION",
  similes: ["NFT_BID", "PLACE_BID", "BID_NFT", "AUCTION_BID"],
  description: "Places a bid on an NFT auction by sending a transaction with the bid amount. If no bid is mentioned, the next valid bid amount is used.",
  handler: async (runtime, message, state, options, callback) => {
    elizaLogger18.log("Starting BID_AUCTION handler...");
    const params = await buildBidAuctionData(runtime, message, state);
    if (!isBidAuctionContent(params)) {
      if (callback) {
        callback({
          text: "Unable to process bid request. Invalid content provided.",
          content: { error: "Invalid bid content" }
        });
      }
      return false;
    }
    try {
      const walletProvider = await initWalletProvider(runtime);
      const bidAuctionAction = new BidAuctionAction(walletProvider);
      const result = await bidAuctionAction.bid(params.nftAddress, params.bidAmount);
      if (callback) {
        callback({
          text: JSON.stringify(result, null, 2),
          content: result
        });
      }
    } catch (error) {
      elizaLogger18.error("Error in BID_AUCTION handler:", error);
      if (callback) {
        callback({
          text: `Error in BID_AUCTION: ${error.message}`,
          content: { error: error.message }
        });
      }
    }
    return true;
  },
  template: bidAuctionTemplate,
  // eslint-disable-next-line
  validate: async (_runtime) => {
    return true;
  },
  examples: [
    [
      {
        user: "{{user1}}",
        content: {
          nftAddress: "EQNftAuctionAddressExample",
          bidAmount: "5000000000",
          action: "BID_AUCTION"
        }
      },
      {
        user: "{{user1}}",
        content: {
          text: "Bid placed successfully"
        }
      }
    ],
    [
      {
        user: "{{user1}}",
        content: {
          nftAddress: "EQNftAuctionAddressExample",
          action: "BID_AUCTION"
        }
      },
      {
        user: "{{user1}}",
        content: {
          text: "Bid placed successfully with minimum valid bid"
        }
      }
    ]
  ]
};

// src/actions/cancelListing.ts
import {
  elizaLogger as elizaLogger19,
  composeContext as composeContext18,
  generateObject as generateObject18,
  ModelClass as ModelClass18
} from "@elizaos/core";
var cancelListingSchema = z.object({
  nftAddress: z.string().nonempty("NFT address is required")
}).refine((data) => data.nftAddress, {
  message: "NFT address is required",
  path: ["nftAddress"]
});
function isCancelListingContent(content) {
  return typeof content.nftAddress === "string";
}
var cancelListingTemplate = `Respond with a JSON markdown block containing only the extracted values.
Example response:
\`\`\`json
{
  "nftAddress": "<NFT address to cancel listing>"
}
\`\`\`

{{recentMessages}}

Respond with a JSON markdown block containing only the extracted values.`;
var buildCancelListingData = async (runtime, message, state) => {
  const context = composeContext18({
    state,
    template: cancelListingTemplate
  });
  const content = await generateObject18({
    runtime,
    context,
    schema: cancelListingSchema,
    modelClass: ModelClass18.SMALL
  });
  return content.object;
};
var CancelListingAction = class {
  walletProvider;
  constructor(walletProvider) {
    this.walletProvider = walletProvider;
  }
  /**
   * Cancels an NFT listing
   */
  async cancel(nftAddress) {
    try {
      elizaLogger19.log(`Starting cancellation of NFT listing: ${nftAddress}`);
      const receipt = await cancelListing(this.walletProvider, nftAddress);
      return receipt;
    } catch (error) {
      elizaLogger19.error(`Error cancelling NFT listing ${nftAddress}: ${error}`);
      throw new Error(`Failed to cancel NFT listing: ${error.message}`);
    }
  }
};
var cancelListing_default = {
  name: "CANCEL_LISTING",
  similes: ["NFT_CANCEL", "CANCEL_NFT", "CANCEL_SALE"],
  description: "Cancels a listed NFT by sending a cancel operation to the listing contract.",
  handler: async (runtime, message, state, options, callback) => {
    elizaLogger19.log("Starting CANCEL_LISTING handler...");
    const params = await buildCancelListingData(runtime, message, state);
    if (!isCancelListingContent(params)) {
      if (callback) {
        callback({
          text: "Unable to process cancel listing request. Invalid content provided.",
          content: { error: "Invalid cancel listing content" }
        });
      }
      return false;
    }
    try {
      const walletProvider = await initWalletProvider(runtime);
      const cancelListingAction = new CancelListingAction(walletProvider);
      const result = await cancelListingAction.cancel(params.nftAddress);
      if (callback) {
        callback({
          text: JSON.stringify(result, null, 2),
          content: result
        });
      }
    } catch (error) {
      elizaLogger19.error("Error in CANCEL_LISTING handler:", error);
      if (callback) {
        callback({
          text: `Error in CANCEL_LISTING: ${error.message}`,
          content: { error: error.message }
        });
      }
    }
    return true;
  },
  template: cancelListingTemplate,
  // eslint-disable-next-line
  validate: async (_runtime) => {
    return true;
  },
  examples: [
    [
      {
        user: "{{user1}}",
        content: {
          nftAddress: "EQNftAddressExample",
          action: "CANCEL_LISTING"
        }
      },
      {
        user: "{{user1}}",
        content: {
          text: "Cancel listing transaction sent successfully"
        }
      }
    ]
  ]
};

// src/actions/transferNFT.ts
import {
  elizaLogger as elizaLogger20,
  composeContext as composeContext19,
  generateObject as generateObject19,
  ModelClass as ModelClass19
} from "@elizaos/core";
import { Address as Address22, beginCell as beginCell15, internal as internal15, toNano as toNano14 } from "@ton/ton";
function isTransferNFTContent(content) {
  console.log("Content for transfer", content);
  return typeof content.nftAddress === "string" && typeof content.newOwner === "string";
}
var transferNFTSchema = z.object({
  nftAddress: z.string().nonempty({ message: "NFT address is required" }),
  newOwner: z.string().nonempty({ message: "New owner address is required" })
});
var transferNFTTemplate = `Respond with a JSON markdown block containing only the extracted values.
Example:
\`\`\`json
{
  "nftAddress": "0QDIUnzAEsgHLL7YSrvm_u7OYSKw93AQbtdidRdcbm7tQep5",
  "newOwner": "EQCGScrZe1xbyWqWDvdI6mzP-GAcAWFv6ZXuaJOuSqemxku4"
}
\`\`\`

{{recentMessages}}

Extract and output only the values as a JSON markdown block.`;
var TransferNFTAction = class {
  walletProvider;
  constructor(walletProvider) {
    this.walletProvider = walletProvider;
  }
  createTransferBody(params) {
    const msgBody = beginCell15();
    msgBody.storeUint(1607220500, 32);
    msgBody.storeUint(0, 64);
    msgBody.storeAddress(params.newOwner);
    msgBody.storeAddress(params.responseTo || null);
    msgBody.storeBit(false);
    msgBody.storeCoins(params.forwardAmount || 0);
    msgBody.storeBit(0);
    return msgBody.endCell();
  }
  /**
   * Crafts and sends a transfer message to the NFT smart contract.
   * Note: This implementation simulates the deployment of the transfer transaction.
   */
  async transfer(params) {
    elizaLogger20.log(
      `[Plugin-TON] Transferring: ${params.nftAddress} to (${params.newOwner})`
    );
    const walletClient = this.walletProvider.getWalletClient();
    const contract = walletClient.open(this.walletProvider.wallet);
    try {
      const nftAddressParsed = Address22.parse(params.nftAddress);
      const newOwnerAddress = Address22.parse(params.newOwner);
      const seqno = await contract.getSeqno();
      const transfer = contract.createTransfer({
        seqno,
        secretKey: this.walletProvider.keypair.secretKey,
        messages: [
          internal15({
            value: "0.05",
            to: nftAddressParsed,
            body: this.createTransferBody({
              newOwner: newOwnerAddress,
              responseTo: contract.address,
              forwardAmount: toNano14("0.02")
            })
          })
        ]
      });
      await contract.send(transfer);
      elizaLogger20.log("Transaction sent, waiting for confirmation...");
      await waitSeqnoContract(seqno, contract);
      const state = await walletClient.getContractState(
        this.walletProvider.wallet.address
      );
      const { lt: _, hash: lastHash } = state.lastTransaction;
      return base64ToHex(lastHash);
    } catch (error) {
      throw new Error(`Transfer failed: ${error.message}`);
    }
  }
};
var buildTransferNFTContent = async (runtime, message, state) => {
  let currentState = state;
  if (!currentState) {
    currentState = await runtime.composeState(message);
  } else {
    currentState = await runtime.updateRecentMessageState(currentState);
  }
  const transferContext = composeContext19({
    state,
    template: transferNFTTemplate
  });
  const content = await generateObject19({
    runtime,
    context: transferContext,
    schema: transferNFTSchema,
    modelClass: ModelClass19.SMALL
  });
  let transferContent = content.object;
  if (transferContent === void 0) {
    transferContent = content;
  }
  return transferContent;
};
var transferNFT_default = {
  name: "TRANSFER_NFT",
  similes: ["NFT_TRANSFER", "TRANSFER_OWNERSHIP"],
  description: "Transfers ownership of an existing NFT item. Only an authorized agent (matching the NFT's current owner) can invoke this action. The authorized wallet is verified using the wallet provider (via runtime settings).",
  handler: async (runtime, message, state, _options, callback) => {
    elizaLogger20.log("Starting TRANSFER_NFT handler...");
    const transferDetails = await buildTransferNFTContent(
      runtime,
      message,
      state
    );
    if (!isTransferNFTContent(transferDetails)) {
      if (callback) {
        callback({
          text: "Unable to process transfer request. Invalid content provided.",
          content: { error: "Invalid transfer content" }
        });
      }
      return false;
    }
    try {
      const walletProvider = await initWalletProvider(runtime);
      const result = await walletProvider.getWalletClient().runMethod(Address22.parse(transferDetails.nftAddress), "get_nft_data");
      const safeStringify2 = (obj) => {
        return JSON.stringify(
          obj,
          (_, value) => typeof value === "bigint" ? value.toString() : value
        );
      };
      elizaLogger20.log(`NFT data result: ${safeStringify2(result)}`);
      const init = result.stack.readNumber();
      const index = result.stack.readNumber();
      const collectionAddress = result.stack.readAddress();
      const ownerAddress = result.stack.readAddress();
      const currentOwnerAddress = ownerAddress?.toString();
      elizaLogger20.log(`Current NFT owner: ${currentOwnerAddress}`);
      if (!currentOwnerAddress) {
        throw new Error("Could not retrieve current NFT owner address.");
      }
      if (currentOwnerAddress !== walletProvider.wallet.address.toString()) {
        throw new Error("You are not the owner of this NFT.");
      }
      elizaLogger20.log(`Current NFT owner: ${currentOwnerAddress}`);
      const transferAction = new TransferNFTAction(walletProvider);
      await transferAction.transfer(transferDetails);
      const response = {
        status: "success",
        nftAddress: transferDetails.nftAddress,
        newOwner: transferDetails.newOwner,
        message: "NFT ownership transfer initiated successfully"
      };
      if (callback) {
        callback({
          text: `Successfully transferred NFT from ${currentOwnerAddress} to ${transferDetails.newOwner}`,
          content: response
        });
      }
      return true;
    } catch (error) {
      elizaLogger20.error("Error transferring NFT:", error);
      if (callback) {
        callback({
          text: `Error transferring NFT: ${error.message}`,
          content: { error: error.message }
        });
      }
      return false;
    }
  },
  validate: async (_runtime) => true,
  template: transferNFTTemplate,
  examples: [
    [
      {
        user: "{{user1}}",
        text: "Transfer NFT with address {{nftAddress}} from {{user1}} to {{user2}}",
        content: {
          nftAddress: "NFT_123456789",
          newOwner: "EQNewOwnerAddressExample",
          action: "TRANSFER_NFT"
        }
      },
      {
        user: "{{user1}}",
        content: {
          text: "NFT ownership transfer initiated successfully"
        }
      }
    ]
  ]
};

// src/actions/mintNFT.ts
import {
  elizaLogger as elizaLogger21,
  composeContext as composeContext20,
  generateObject as generateObject20,
  ModelClass as ModelClass20
} from "@elizaos/core";
import { Address as Address24, toNano as toNano15 } from "@ton/ton";
import path3 from "path";

// src/utils/NFTCollection.ts
import { beginCell as beginCell16, Cell as Cell11, internal as internal16, contractAddress, SendMode as SendMode13 } from "@ton/ton";
var NFTCollection = class {
  collectionData;
  constructor(collectionData) {
    this.collectionData = collectionData;
  }
  createCodeCell() {
    const NftCollectionCodeBoc = "te6cckECFAEAAh8AART/APSkE/S88sgLAQIBYgkCAgEgBAMAJbyC32omh9IGmf6mpqGC3oahgsQCASAIBQIBIAcGAC209H2omh9IGmf6mpqGAovgngCOAD4AsAAvtdr9qJofSBpn+pqahg2IOhph+mH/SAYQAEO4tdMe1E0PpA0z/U1NQwECRfBNDUMdQw0HHIywcBzxbMyYAgLNDwoCASAMCwA9Ra8ARwIfAFd4AYyMsFWM8WUAT6AhPLaxLMzMlx+wCAIBIA4NABs+QB0yMsCEsoHy//J0IAAtAHIyz/4KM8WyXAgyMsBE/QA9ADLAMmAE59EGOASK3wAOhpgYC42Eit8H0gGADpj+mf9qJofSBpn+pqahhBCDSenKgpQF1HFBuvgoDoQQhUZYBWuEAIZGWCqALnixJ9AQpltQnlj+WfgOeLZMAgfYBwGyi544L5cMiS4ADxgRLgAXGBEuAB8YEYGYHgAkExIREAA8jhXU1DAQNEEwyFAFzxYTyz/MzMzJ7VTgXwSED/LwACwyNAH6QDBBRMhQBc8WE8s/zMzMye1UAKY1cAPUMI43gED0lm+lII4pBqQggQD6vpPywY/egQGTIaBTJbvy9AL6ANQwIlRLMPAGI7qTAqQC3gSSbCHis+YwMlBEQxPIUAXPFhPLP8zMzMntVABgNQLTP1MTu/LhklMTugH6ANQwKBA0WfAGjhIBpENDyFAFzxYTyz/MzMzJ7VSSXwXiN0CayQ==";
    return Cell11.fromBase64(NftCollectionCodeBoc);
  }
  createDataCell() {
    const data = this.collectionData;
    const dataCell = beginCell16();
    dataCell.storeAddress(data.ownerAddress);
    dataCell.storeUint(data.nextItemIndex, 64);
    const contentCell = beginCell16();
    const collectionContent = encodeOffChainContent(data.collectionContentUrl);
    const commonContent = beginCell16();
    commonContent.storeBuffer(Buffer.from(data.commonContentUrl));
    contentCell.storeRef(collectionContent);
    contentCell.storeRef(commonContent.asCell());
    dataCell.storeRef(contentCell);
    const NftItemCodeCell = Cell11.fromBase64(
      "te6cckECDQEAAdAAART/APSkE/S88sgLAQIBYgMCAAmhH5/gBQICzgcEAgEgBgUAHQDyMs/WM8WAc8WzMntVIAA7O1E0NM/+kAg10nCAJp/AfpA1DAQJBAj4DBwWW1tgAgEgCQgAET6RDBwuvLhTYALXDIhxwCSXwPg0NMDAXGwkl8D4PpA+kAx+gAxcdch+gAx+gAw8AIEs44UMGwiNFIyxwXy4ZUB+kDUMBAj8APgBtMf0z+CEF/MPRRSMLqOhzIQN14yQBPgMDQ0NTWCEC/LJqISuuMCXwSED/LwgCwoAcnCCEIt3FzUFyMv/UATPFhAkgEBwgBDIywVQB88WUAX6AhXLahLLH8s/Im6zlFjPFwGRMuIByQH7AAH2UTXHBfLhkfpAIfAB+kDSADH6AIIK+vCAG6EhlFMVoKHeItcLAcMAIJIGoZE24iDC//LhkiGOPoIQBRONkchQCc8WUAvPFnEkSRRURqBwgBDIywVQB88WUAX6AhXLahLLH8s/Im6zlFjPFwGRMuIByQH7ABBHlBAqN1viDACCAo41JvABghDVMnbbEDdEAG1xcIAQyMsFUAfPFlAF+gIVy2oSyx/LPyJus5RYzxcBkTLiAckB+wCTMDI04lUC8ANqhGIu"
    );
    dataCell.storeRef(NftItemCodeCell);
    const royaltyBase = 1e3;
    const royaltyFactor = Math.floor(data.royaltyPercent * royaltyBase);
    const royaltyCell = beginCell16();
    royaltyCell.storeUint(royaltyFactor, 16);
    royaltyCell.storeUint(royaltyBase, 16);
    royaltyCell.storeAddress(data.royaltyAddress);
    dataCell.storeRef(royaltyCell);
    return dataCell.endCell();
  }
  get stateInit() {
    const code = this.createCodeCell();
    const data = this.createDataCell();
    return { code, data };
  }
  get address() {
    return contractAddress(0, this.stateInit);
  }
  async deploy(walletProvider) {
    const walletClient = walletProvider.getWalletClient();
    const contract = walletClient.open(walletProvider.wallet);
    const seqno = await contract.getSeqno();
    await contract.sendTransfer({
      seqno,
      secretKey: walletProvider.keypair.secretKey,
      messages: [
        internal16({
          value: "0.05",
          to: this.address,
          init: this.stateInit
        })
      ],
      sendMode: SendMode13.PAY_GAS_SEPARATELY + SendMode13.IGNORE_ERRORS
    });
    return seqno;
  }
};

// src/actions/mintNFT.ts
import { readdir } from "fs/promises";
function isMintContent(content) {
  elizaLogger21.log("Validating mint content:", content);
  if (!content.nftType || !content.storage) {
    elizaLogger21.error("Missing required fields: nftType or storage");
    return false;
  }
  if (content.nftType !== "collection" && content.nftType !== "standalone") {
    elizaLogger21.error(`Invalid nftType: ${content.nftType}`);
    return false;
  }
  if (content.nftType === "standalone" && !content.collection) {
    elizaLogger21.error("Collection address is required for standalone NFTs");
    return false;
  }
  if (content.storage !== "file" && content.storage !== "prompt") {
    elizaLogger21.error(`Invalid storage type: ${content.storage}`);
    return false;
  }
  return true;
}
var mintNFTSchema = z.object({
  nftType: z.enum(["collection", "standalone"]).default("standalone"),
  collection: z.string().optional().nullable(),
  owner: z.string().nonempty({ message: "Owner address is required" }),
  storage: z.enum(["file", "prompt"]).default("file"),
  imagesFolderPath: z.string().optional().nullable(),
  metadataFolderPath: z.string().optional().nullable(),
  royaltyPercent: z.number().optional().nullable(),
  royaltyAddress: z.string().optional().nullable(),
  metadata: z.object({
    name: z.string().nonempty({ message: "NFT name is required" }),
    description: z.string().optional(),
    image: z.string().nonempty({ message: "Image URL is required" }),
    cover_image: z.string().optional(),
    social_links: z.array(z.string().optional()).optional()
  }).optional().nullable()
}).refine((data) => {
  if (data.nftType === "standalone") {
    return data.collection && data.collection.trim() !== "";
  }
  return true;
}, {
  message: "Collection address is required for standalone NFTs",
  path: ["collection"]
});
var mintNFTTemplate = `Respond with a JSON markdown block containing only the extracted values.
Use null for any values that cannot be determined.

Example response for standalone NFT (belongs to a collection):
\`\`\`json
{
    "nftType": "standalone",
    "collection": "EQCGScrZe1xbyWqWDvdI6mzP-GAcAWFv6ZXuaJOuSqemxku4",
    "owner": "EQCGScrZe1xbyWqWDvdI6mzP-GAcAWFv6ZXuaJOuSqemxku4",
    "storage": "prompt",
    "metadata": {
        "name": "Rare NFT Artwork",
        "description": "A unique NFT artwork minted on TON",
        "image": "https://example.com/nft-image.png",
        "cover_image": "https://example.com/nft-cover-image.png",
        "social_links": {
            "twitter": "https://x.com/example",
            "telegram": "https://t.me/example",
            "website": "https://example.com"
        }
    }
}
\`\`\`

Example response for collection NFT (new collection):
\`\`\`json
{
    "nftType": "collection",
    "owner": "EQCGScrZe1xbyWqWDvdI6mzP-GAcAWFv6ZXuaJOuSqemxku4",
    "storage": "file",
    "imagesFolderPath": "path/to/images",
    "metadataFolderPath": "path/to/metadata",
    "royaltyPercent": 0.05,
    "royaltyAddress": "EQCGScrZe1xbyWqWDvdI6mzP-GAcAWFv6ZXuaJOuSqemxku4"
}
\`\`\`

{{recentMessages}}

Given the recent messages, extract the required information to mint an NFT:
- NFT type: "collection" or "standalone"
- Collection address: For collection NFTs, the collection address must be provided.
- The owner address.
- Storage option: "file" or "prompt"
- NFT metadata including name, image, optional description for "prompt" storage,
- Images folder path: For "file" storage, the path to the images folder.
- Metadata folder path: For "file" storage, the path to the metadata folder.

Respond with a JSON markdown block containing only the extracted values.`;
var buildMintDetails = async (runtime, message, state) => {
  let currentState = state;
  if (!currentState) {
    currentState = await runtime.composeState(message);
  } else {
    currentState = await runtime.updateRecentMessageState(currentState);
  }
  const mintContext = composeContext20({
    state: currentState,
    template: mintNFTTemplate
  });
  try {
    const content = await generateObject20({
      runtime,
      context: mintContext,
      schema: mintNFTSchema,
      modelClass: ModelClass20.SMALL
    });
    let mintContent = content.object;
    if (mintContent === void 0) {
      mintContent = content;
    }
    return mintContent;
  } catch (error) {
    elizaLogger21.error("Error generating mint content:", error);
    throw new Error(`Failed to generate mint content: ${error.message}`);
  }
};
var MintNFTAction = class {
  walletProvider;
  constructor(walletProvider) {
    this.walletProvider = walletProvider;
  }
  /**
   * Uploads content to IPFS based on storage type
   */
  async uploadContent(params) {
    let metadataIpfsHash;
    let imagesIpfsHash;
    try {
      if (params.storage === "file") {
        if (!params.imagesFolderPath || !params.metadataFolderPath) {
          throw new Error("Image and metadata folder paths are required for file storage");
        }
        elizaLogger21.log("Started uploading images to IPFS...");
        imagesIpfsHash = await uploadFolderToIPFS(params.imagesFolderPath);
        elizaLogger21.log(
          `Successfully uploaded the pictures to ipfs: https://gateway.pinata.cloud/ipfs/${imagesIpfsHash}`
        );
        elizaLogger21.log("Started uploading metadata files to IPFS...");
        await updateMetadataFiles(params.metadataFolderPath, imagesIpfsHash);
        metadataIpfsHash = await uploadFolderToIPFS(params.metadataFolderPath);
        elizaLogger21.log(
          `Successfully uploaded the metadata to ipfs: https://gateway.pinata.cloud/ipfs/${metadataIpfsHash}`
        );
        return { metadataIpfsHash, imagesIpfsHash };
      } else if (params.storage === "prompt") {
        if (!params.metadata) {
          throw new Error("Metadata is required for prompt storage");
        }
        elizaLogger21.log("Uploading metadata JSON to IPFS...");
        metadataIpfsHash = await uploadJSONToIPFS(params.metadata);
        elizaLogger21.log(`Successfully uploaded metadata to IPFS: ${metadataIpfsHash}`);
        return { metadataIpfsHash };
      }
      throw new Error("Invalid storage type");
    } catch (error) {
      elizaLogger21.error("Error uploading content to IPFS:", error);
      throw new Error(`Failed to upload content: ${error.message}`);
    }
  }
  /**
   * Deploys a standalone NFT to an existing collection
   */
  async deployStandaloneNFT(params) {
    if (!params.collection) {
      throw new Error("Collection address is required for standalone NFTs");
    }
    try {
      elizaLogger21.log(`Reading metadata files from ${params.metadataFolderPath}`);
      const files = await readdir(params.metadataFolderPath);
      files.pop();
      let index = 0;
      elizaLogger21.log(`Found ${files.length} NFT metadata files to deploy`);
      elizaLogger21.log("Topping up wallet balance...");
      let seqno = await topUpBalance(this.walletProvider, files.length, params.collection);
      const walletClient = this.walletProvider.getWalletClient();
      const contract = walletClient.open(this.walletProvider.wallet);
      await waitSeqnoContract(seqno, contract);
      for (const file of files) {
        elizaLogger21.log(`Starting deployment of NFT ${index + 1}/${files.length}`);
        const mintParams = {
          queryId: 0,
          itemOwnerAddress: this.walletProvider.wallet.address,
          itemIndex: index,
          amount: toNano15("0.05"),
          commonContentUrl: file
        };
        const nftItem = new NftItem(params.collection);
        seqno = await nftItem.deploy(this.walletProvider, mintParams);
        await waitSeqnoContract(seqno, this.walletProvider.wallet);
        const client = this.walletProvider.getWalletClient();
        const nftAddress = await getAddressByIndex(
          client,
          Address24.parse(params.collection),
          index
        );
        elizaLogger21.log(`Successfully deployed NFT ${index + 1}/${files.length} with address: ${nftAddress}`);
        index++;
      }
    } catch (error) {
      elizaLogger21.error("Error deploying standalone NFT:", error);
      throw new Error(`Failed to deploy standalone NFT: ${error.message}`);
    }
  }
  /**
   * Deploys a new NFT collection
   */
  async deployCollection(params, metadataIpfsHash) {
    try {
      elizaLogger21.log("[TON] Starting deployment of NFT collection...");
      const royaltyPercent = params.royaltyPercent ?? 5;
      const royaltyAddress = params.royaltyAddress ? Address24.parse(params.royaltyAddress) : this.walletProvider.wallet.address;
      const collectionData = {
        ownerAddress: this.walletProvider.wallet.address,
        royaltyPercent,
        royaltyAddress,
        nextItemIndex: 0,
        collectionContentUrl: `ipfs://${metadataIpfsHash}/collection.json`,
        commonContentUrl: `ipfs://${metadataIpfsHash}/`
      };
      elizaLogger21.log("Creating NFT collection with data:", {
        owner: collectionData.ownerAddress.toString(),
        royaltyPercent: collectionData.royaltyPercent,
        royaltyAddress: collectionData.royaltyAddress.toString(),
        collectionContentUrl: collectionData.collectionContentUrl
      });
      const collection = new NFTCollection(collectionData);
      let seqno = await collection.deploy(this.walletProvider);
      elizaLogger21.log(`Collection deployment transaction sent, waiting for confirmation...`);
      const walletClient = this.walletProvider.getWalletClient();
      const contract = walletClient.open(this.walletProvider.wallet);
      await waitSeqnoContract(seqno, contract);
      elizaLogger21.log(`Collection successfully deployed: ${collection.address}`);
      return collection.address.toString();
    } catch (error) {
      elizaLogger21.error("Error deploying NFT collection:", error);
      throw new Error(`Failed to deploy NFT collection: ${error.message}`);
    }
  }
  /**
   * Main minting method.
   * If file storage is selected, uploads contents to IPFS and updates metadata.
   * If prompt storage is selected, uploads metadata to IPFS.
   * Then, based on nftType:
   * - For "collection": a new collection address is simulated and the first NFT (index 0) is minted.
   * - For "standalone": uses the provided collection address and queries it to get the next available NFT index.
   */
  async mint(params) {
    try {
      elizaLogger21.log(`Starting NFT minting process for type: ${params.nftType}`);
      elizaLogger21.log(`Using storage type: ${params.storage}`);
      const { metadataIpfsHash } = await this.uploadContent(params);
      elizaLogger21.log(`Content uploaded to IPFS with hash: ${metadataIpfsHash}`);
      if (params.nftType === "standalone") {
        elizaLogger21.log(`Deploying standalone NFT to collection: ${params.collection}`);
        return await this.deployStandaloneNFT(params);
      } else if (params.nftType === "collection") {
        elizaLogger21.log("Deploying new NFT collection");
        return await this.deployCollection(params, metadataIpfsHash);
      } else {
        throw new Error(`Invalid NFT type: ${params.nftType}`);
      }
    } catch (error) {
      elizaLogger21.error("Error in mint method:", error);
      throw new Error(`Mint operation failed: ${error.message}`);
    }
  }
};
var mintNFT_default = {
  name: "MINT_NFT",
  similes: ["NFT_MINT", "MINT_NEW_NFT"],
  description: "Mints a new NFT. Can initialize a new NFT Collection (if selected) or mint a standalone NFT. Supports on-chain/off-chain metadata storage with IPFS upload and deploys the NFT contract using the TON SDK.",
  handler: async (runtime, message, state, _options, callback) => {
    elizaLogger21.log("Starting MINT_NFT handler...");
    try {
      let mintParams = await buildMintDetails(runtime, message, state);
      elizaLogger21.log("Mint parameters extracted:", {
        nftType: mintParams.nftType,
        storage: mintParams.storage,
        collection: mintParams.collection || "N/A"
      });
      if (!isMintContent(mintParams)) {
        elizaLogger21.error("Invalid mint content:", mintParams);
        if (callback) {
          callback({
            text: "Unable to process mint request. Invalid content provided.",
            content: { error: "Invalid mint content" }
          });
        }
        return false;
      }
      mintParams.imagesFolderPath = mintParams.imagesFolderPath || runtime.getSetting("TON_NFT_IMAGES_FOLDER") || path3.join(process.cwd(), "ton_nft_images");
      mintParams.metadataFolderPath = mintParams.metadataFolderPath || runtime.getSetting("TON_NFT_METADATA_FOLDER") || path3.join(process.cwd(), "ton_nft_metadata");
      elizaLogger21.log("Using paths:", {
        imagesFolderPath: mintParams.imagesFolderPath,
        metadataFolderPath: mintParams.metadataFolderPath
      });
      const walletProvider = await initWalletProvider(runtime);
      const mintNFTAction = new MintNFTAction(walletProvider);
      const nftAddress = await mintNFTAction.mint(mintParams);
      const result = {
        status: "success",
        nftAddress,
        collection: mintParams.collection,
        owner: mintParams.owner,
        metadata: mintParams.metadata,
        nftType: mintParams.nftType,
        message: "NFT minted successfully"
      };
      elizaLogger21.log("NFT minted successfully:", result);
      if (callback) {
        callback({
          text: `NFT minted successfully. NFT Address: ${nftAddress}`,
          content: result
        });
      }
      return true;
    } catch (error) {
      elizaLogger21.error("Error minting NFT:", error);
      if (callback) {
        callback({
          text: `Error minting NFT: ${error.message}`,
          content: { error: error.message }
        });
      }
      return false;
    }
  },
  validate: async (_runtime) => true,
  examples: [
    [
      {
        user: "{{user1}}",
        text: "Mint a new NFT, The metadata is: name: Rare NFT Artwork, description: A unique NFT artwork minted on TON, image: https://example.com/nft-image.png, storage: off-chain, ipfsProvider: ipfs.io",
        content: {
          nftType: "standalone",
          collection: "EQC123CollectionAddress",
          // required for standalone NFTs
          owner: "EQCOwnerAddress123",
          metadata: {
            name: "Rare NFT Artwork",
            description: "A unique NFT artwork minted on TON",
            image: "https://example.com/nft-image.png",
            storage: "off-chain",
            ipfsProvider: "ipfs.io"
          },
          action: "MINT_NFT"
        }
      },
      {
        user: "{{user1}}",
        content: {
          text: "NFT minted successfully. NFT Address: NFT_..."
        }
      }
    ]
  ],
  template: mintNFTTemplate
};

// src/actions/getCollectionData.ts
import {
  elizaLogger as elizaLogger22,
  composeContext as composeContext21,
  generateObject as generateObject21,
  ModelClass as ModelClass21
} from "@elizaos/core";
import {
  Address as Address25
} from "@ton/ton";
function isGetCollectionDataContent(content) {
  return typeof content.collectionAddress === "string";
}
var getCollectionDataSchema = z.object({
  collectionAddress: z.string().nonempty("Collection address is required")
});
var getCollectionDataTemplate = `Respond with a JSON markdown block containing only the extracted values. Use null for any values that cannot be determined.

Example response:
\`\`\`json
{
  "collectionAddress": "EQCGScrZe1xbyWqWDvdI6mzP-GAcAWFv6ZXuaJOuSqemxku4"
}
\`\`\`

{{recentMessages}}

Given the recent messages, extract the following information about the requested NFT collection data:
- Collection address

Respond with a JSON markdown block containing only the extracted values.`;
var safeStringify = (obj) => {
  return JSON.stringify(
    obj,
    (_, value) => typeof value === "bigint" ? value.toString() : value
  );
};
var GetCollectionDataAction = class {
  walletProvider;
  constructor(walletProvider) {
    this.walletProvider = walletProvider;
  }
  /**
   * Retrieves and parses collection data from the provided collection address.
   * Returns an object containing the next NFT index, owner address, royalty info, and NFT items.
   */
  async getData(collectionAddress) {
    const walletClient = this.walletProvider.getWalletClient();
    const addr = Address25.parse(collectionAddress);
    try {
      elizaLogger22.log("Fetching collection data...");
      const collectionDataResult = await walletClient.runMethod(addr, "get_collection_data");
      elizaLogger22.log(`Collection data result: ${safeStringify(collectionDataResult)}`);
      const nextItemIndex = collectionDataResult.stack.readNumber();
      collectionDataResult.stack.readCell();
      let ownerAddressStr = null;
      try {
        const ownerAddress = collectionDataResult.stack.readAddress();
        ownerAddressStr = ownerAddress.toString();
      } catch (e) {
        elizaLogger22.error("Error reading owner address:", e);
        ownerAddressStr = null;
      }
      let royaltyParams = null;
      try {
        elizaLogger22.log("Fetching royalty parameters...");
        const royaltyResult = await walletClient.runMethod(addr, "royalty_params");
        elizaLogger22.log(`Royalty result: ${safeStringify(royaltyResult)}`);
        const numerator = royaltyResult.stack.readNumber();
        const denominator = royaltyResult.stack.readNumber();
        const destination = royaltyResult.stack.readAddress().toString();
        royaltyParams = {
          numerator,
          denominator,
          destination
        };
      } catch (e) {
        elizaLogger22.error("Error fetching royalty parameters:", e);
      }
      const nftItems = [];
      elizaLogger22.log(`Collection has ${nextItemIndex} NFT items. Fetching addresses...`);
      for (let i = 0; i < nextItemIndex; i++) {
        try {
          const nftAddressResult = await walletClient.runMethod(addr, "get_nft_address_by_index", [
            { type: "int", value: BigInt(i) }
          ]);
          const nftAddress = nftAddressResult.stack.readAddress().toString();
          nftItems.push({
            index: i,
            address: nftAddress
          });
        } catch (e) {
          elizaLogger22.error(`Error fetching NFT address for index ${i}:`, e);
        }
      }
      return {
        collectionAddress,
        nextItemIndex,
        ownerAddress: ownerAddressStr,
        royaltyParams,
        nftItems,
        message: "Collection data fetched successfully"
      };
    } catch (error) {
      elizaLogger22.error("Error fetching collection data:", error);
      throw error;
    }
  }
};
var buildGetCollectionData = async (runtime, message, state) => {
  let currentState = state;
  if (!currentState) {
    currentState = await runtime.composeState(message);
  } else {
    currentState = await runtime.updateRecentMessageState(currentState);
  }
  const getCollectionContext = composeContext21({
    state: currentState,
    template: getCollectionDataTemplate
  });
  const content = await generateObject21({
    runtime,
    context: getCollectionContext,
    schema: getCollectionDataSchema,
    modelClass: ModelClass21.SMALL
  });
  let buildGetCollectionDataContent = content.object;
  if (buildGetCollectionDataContent === void 0) {
    buildGetCollectionDataContent = content;
  }
  return buildGetCollectionDataContent;
};
var getCollectionData_default = {
  name: "GET_NFT_COLLECTION_DATA",
  similes: ["GET_COLLECTION_DATA", "FETCH_NFT_COLLECTION"],
  description: "Fetches collection data (next NFT index, owner address, royalty parameters, and NFT item addresses) from the provided NFT collection address.",
  handler: async (runtime, message, state, _options, callback) => {
    elizaLogger22.log("Starting GET_NFT_COLLECTION_DATA handler...");
    try {
      const getCollectionDetails = await buildGetCollectionData(runtime, message, state);
      if (!isGetCollectionDataContent(getCollectionDetails)) {
        if (callback) {
          callback({
            text: "Unable to process get collection data request. Invalid content provided.",
            content: { error: "Invalid get collection data content" }
          });
        }
        return false;
      }
      const walletProvider = await initWalletProvider(runtime);
      const getCollectionDataAction = new GetCollectionDataAction(walletProvider);
      const collectionData = await getCollectionDataAction.getData(getCollectionDetails.collectionAddress);
      const nftItemsText = collectionData.nftItems.length > 0 ? `Contains ${collectionData.nftItems.length} NFT items.` : "No NFT items found in this collection.";
      const royaltyText = collectionData.royaltyParams ? `Royalty: ${collectionData.royaltyParams.numerator / collectionData.royaltyParams.denominator * 100}% to ${collectionData.royaltyParams.destination}` : "No royalty information available.";
      const ownerText = collectionData.ownerAddress ? `Owner: ${collectionData.ownerAddress}` : "Owner information not available.";
      const responseText = `Collection data fetched successfully.
${ownerText}
${royaltyText}
${nftItemsText}`;
      if (callback) {
        callback({
          text: responseText,
          content: collectionData
        });
      }
      return true;
    } catch (error) {
      elizaLogger22.error("Error fetching collection data:", error);
      if (callback) {
        callback({
          text: `Error fetching collection data: ${error.message}`,
          content: { error: error.message }
        });
      }
      return false;
    }
  },
  validate: async (_runtime) => true,
  template: getCollectionDataTemplate,
  examples: [
    [
      {
        user: "{{user1}}",
        text: "Get collection data for collection address {{collectionAddress}}",
        content: {
          collectionAddress: "EQSomeCollectionAddressExample",
          action: "GET_NFT_COLLECTION_DATA"
        }
      },
      {
        user: "{{user1}}",
        content: {
          text: "Collection data fetched successfully. Owner: EQ..., Royalty: 5% to EQ..., Contains 10 NFT items."
        }
      }
    ]
  ]
};

// src/actions/updateNFTMetadata.ts
import {
  elizaLogger as elizaLogger23,
  composeContext as composeContext22,
  generateObject as generateObject22,
  ModelClass as ModelClass22
} from "@elizaos/core";
import { Address as Address26, beginCell as beginCell17, internal as internal17, toNano as toNano16 } from "@ton/ton";
import path4 from "path";
var updateNFTMetadataSchema = z.object({
  nftAddress: z.string().nonempty({ message: "NFT address is required" }),
  storage: z.enum(["prompt", "file"]).default("prompt"),
  imagesFolderPath: z.string().optional(),
  metadataFolderPath: z.string().optional(),
  metadata: z.object({
    name: z.string().optional(),
    description: z.string().optional(),
    image: z.string().optional(),
    content_url: z.string().optional(),
    attributes: z.array(z.any()).optional()
  }).optional(),
  // New fields for on-chain update via custom message:
  newCollectionMeta: z.string().optional(),
  newNftCommonMeta: z.string().optional(),
  royaltyPercent: z.number().optional(),
  royaltyAddress: z.string().optional()
});
var updateNFTMetadataTemplate = `Respond with a JSON markdown block containing only the extracted values.
Example response for NFT with metadata in prompt:
\`\`\`json
{
    "nftAddress": "EQCGScrZe1xbyWqWDvdI6mzP-GAcAWFv6ZXuaJOuSqemxku4",
    "storage": "prompt",
    "royaltyPercent": 0.05,
    "royaltyAddress": "EQCGScrZe1xbyWqWDvdI6mzP-GAcAWFv6ZXuaJOuSqemxku4",
    "metadata": {
        "name": "Rare NFT Artwork",
        "description": "A unique NFT artwork minted on TON",
        "image": "https://example.com/nft-image.png"
    }
}
\`\`\`

Example response for file-based storage:
\`\`\`json
{
    "nftAddress": "EQCGScrZe1xbyWqWDvdI6mzP-GAcAWFv6ZXuaJOuSqemxku4",
    "storage": "file",
    "imagesFolderPath": "path/to/images",
    "metadataFolderPath": "path/to/metadata",
    "royaltyPercent": 0.05,
    "royaltyAddress": "EQCGScrZe1xbyWqWDvdI6mzP-GAcAWFv6ZXuaJOuSqemxku4"
}
\`\`\`

{{recentMessages}}

Extract and output only the values as a JSON markdown block.`;
function isUpdateNFTMetadataContent(content) {
  return typeof content.nftAddress === "string" && typeof content.storage === "string" && (content.storage === "prompt" || content.storage === "file");
}
var buildUpdateDetails = async (runtime, message, state) => {
  const updateContext = composeContext22({
    state,
    template: updateNFTMetadataTemplate
  });
  const content = await generateObject22({
    runtime,
    context: updateContext,
    schema: updateNFTMetadataSchema,
    modelClass: ModelClass22.SMALL
  });
  return content.object;
};
var UpdateNFTMetadataAction = class {
  walletProvider;
  constructor(walletProvider) {
    this.walletProvider = walletProvider;
  }
  /**
   * Uploads content to IPFS based on storage type
   */
  async uploadContent(params) {
    let metadataIpfsHash;
    let imagesIpfsHash;
    if (params.storage === "file") {
      if (!params.imagesFolderPath || !params.metadataFolderPath) {
        throw new Error("Image and metadata folder paths are required for file storage");
      }
      elizaLogger23.log("Started uploading images to IPFS...");
      imagesIpfsHash = await uploadFolderToIPFS(params.imagesFolderPath);
      elizaLogger23.log(
        `Successfully uploaded the pictures to ipfs: https://gateway.pinata.cloud/ipfs/${imagesIpfsHash}`
      );
      elizaLogger23.log("Started uploading metadata files to IPFS...");
      await updateMetadataFiles(params.metadataFolderPath, imagesIpfsHash);
      metadataIpfsHash = await uploadFolderToIPFS(params.metadataFolderPath);
      elizaLogger23.log(
        `Successfully uploaded the metadata to ipfs: https://gateway.pinata.cloud/ipfs/${metadataIpfsHash}`
      );
      return { metadataIpfsHash, imagesIpfsHash };
    } else if (params.storage === "prompt") {
      if (!params.metadata) {
        throw new Error("Metadata is required for prompt storage");
      }
      metadataIpfsHash = await uploadJSONToIPFS(params.metadata);
      return { metadataIpfsHash };
    }
    throw new Error("Invalid storage type");
  }
  /**
   * Crafts and sends an on-chain update transaction that changes the NFT's content.
   * The message follows the provided example:
   * - Opcode 4 indicates a "change content" operation.
   * - The message body stores a reference to a content cell (built from the new collection meta and NFT common meta)
   *   and a royalty cell.
   */
  async updateNFTMetadataOnChain(params) {
    const nftTonAddress = Address26.parse(params.nftAddress);
    const collectionMetaCell = beginCell17().storeUint(1, 8).storeStringTail(params.newCollectionMeta).endCell();
    const nftCommonMetaCell = beginCell17().storeUint(1, 8).storeStringTail(params.newNftCommonMeta).endCell();
    const contentCell = beginCell17().storeRef(collectionMetaCell).storeRef(nftCommonMetaCell).endCell();
    const royaltyCell = beginCell17().storeUint(params.royaltyPercent * 100, 16).storeUint(1e4, 16).storeAddress(Address26.parse(params.royaltyAddress)).endCell();
    const messageBody = beginCell17().storeUint(4, 32).storeUint(0, 64).storeRef(contentCell).storeRef(royaltyCell).endCell();
    const updateMessage = internal17({
      to: nftTonAddress,
      value: toNano16("0.05"),
      bounce: true,
      body: messageBody
    });
    const walletClient = this.walletProvider.getWalletClient();
    const contract = walletClient.open(this.walletProvider.wallet);
    const seqno = await contract.getSeqno();
    const transfer = await contract.createTransfer({
      seqno,
      secretKey: this.walletProvider.keypair.secretKey,
      messages: [updateMessage]
    });
    await contract.send(transfer);
    elizaLogger23.log("Transaction sent, waiting for confirmation...");
    await waitSeqnoContract(seqno, contract);
    const state = await walletClient.getContractState(
      this.walletProvider.wallet.address
    );
    const { lt: _, hash: lastHash } = state.lastTransaction;
    return base64ToHex(lastHash);
  }
  async update(params) {
    const { metadataIpfsHash } = await this.uploadContent(params);
    if (!params.newCollectionMeta) {
      params.newCollectionMeta = `ipfs://${metadataIpfsHash}/collection.json`;
    }
    if (!params.newNftCommonMeta) {
      params.newNftCommonMeta = `ipfs://${metadataIpfsHash}/`;
    }
    return await this.updateNFTMetadataOnChain(params);
  }
};
var updateNFTMetadata_default = {
  name: "UPDATE_NFT_METADATA",
  similes: ["NFT_UPDATE", "UPDATE_METADATA"],
  description: "Updates NFT metadata post-mint. Supports partial or full metadata edits with on-chain or off-chain constraints. For off-chain storage, metadata is uploaded using Helia. For on-chain updates, a custom update message (using opcode 4) is sent, updating content and royalty information.",
  handler: async (runtime, message, state, _options, callback) => {
    elizaLogger23.log("Starting UPDATE_NFT_METADATA handler...");
    const updateDetails = await buildUpdateDetails(runtime, message, state);
    if (!isUpdateNFTMetadataContent(updateDetails)) {
      if (callback) {
        callback({
          text: "Unable to process update request. Invalid content provided.",
          content: { error: "Invalid update content" }
        });
      }
      return false;
    }
    try {
      if (updateDetails.storage === "file") {
        updateDetails.imagesFolderPath = runtime.getSetting("TON_NFT_IMAGES_FOLDER") || path4.join(process.cwd(), "ton_nft_images");
        updateDetails.metadataFolderPath = runtime.getSetting("TON_NFT_METADATA_FOLDER") || path4.join(process.cwd(), "ton_nft_metadata");
      }
      const walletProvider = await initWalletProvider(runtime);
      const updateAction = new UpdateNFTMetadataAction(walletProvider);
      const hash = await updateAction.update(updateDetails);
      const result = {
        status: "success",
        nftAddress: updateDetails.nftAddress,
        updatedMetadata: updateDetails.metadata,
        message: "NFT metadata updated successfully",
        hash
      };
      if (callback) {
        callback({
          text: `NFT metadata updated successfully`,
          content: result
        });
      }
      return true;
    } catch (error) {
      elizaLogger23.error("Error updating NFT metadata:", error);
      if (callback) {
        callback({
          text: `Error updating NFT metadata: ${error.message}`,
          content: { error: error.message }
        });
      }
      return false;
    }
  },
  validate: async (_runtime) => true,
  template: updateNFTMetadataTemplate,
  examples: [
    [
      {
        user: "{{user1}}",
        content: {
          nftAddress: "NFT_123456789",
          metadata: {
            name: "Updated NFT Artwork",
            description: "New description for NFT",
            image: "https://example.com/new-image.png",
            storage: "off-chain"
            // or "on-chain"
          },
          // Fields for on-chain update (if storage is "on-chain")
          newCollectionMeta: "https://example.com/new-collection-meta.json",
          newNftCommonMeta: "https://example.com/new-nft-common-meta.json",
          royaltyAddress: "EQRoyaltyAddressExample",
          action: "UPDATE_NFT_METADATA"
        }
      },
      {
        user: "{{user1}}",
        content: {
          text: "NFT metadata updated successfully"
        }
      }
    ]
  ]
};

// src/actions/tokenPrice.ts
import {
  elizaLogger as elizaLogger24
} from "@elizaos/core";

// src/providers/tokenProvider.ts
import { gunzip } from "zlib";
import { promisify } from "util";
var gunzipAsync = promisify(gunzip);
var TonTokenPriceProvider = class {
  tokenCache = /* @__PURE__ */ new Map();
  // Symbol/Name -> Address
  poolCache = /* @__PURE__ */ new Map();
  // Pair Symbol -> Pool Address
  cacheTimestamp = 0;
  CACHE_TTL = 3e5;
  // 5 minutes
  TONAPI_ENDPOINT = "https://tonapi.io/v2";
  DEDUST_API_ENDPOINT = "https://api.dedust.io/v1/pools";
  DEXSCREENER_API_ENDPOINT = "https://api.dexscreener.com/latest/dex/pairs/ton";
  constructor() {
    this.initializeTokenCache();
    this.initializePoolCache();
  }
  async initializeTokenCache() {
    try {
      const response = await fetch("https://api.dedust.io/v2/assets");
      const tokens = await response.json();
      tokens.forEach((token) => {
        this.tokenCache.set(token.symbol.toLowerCase(), token.address || "TON");
        this.tokenCache.set(token.name.toLowerCase(), token.address || "TON");
      });
      this.cacheTimestamp = Date.now();
    } catch (error) {
      console.error("Failed to initialize token cache:", error);
    }
  }
  async initializePoolCache() {
    try {
      const response = await fetch(this.DEDUST_API_ENDPOINT);
      const pools = await response.json();
      pools.forEach((pool) => {
        const pairSymbol = `${pool.left_token_symbol}/${pool.right_token_symbol}`;
        this.poolCache.set(pairSymbol.toLowerCase(), pool.address);
      });
      this.cacheTimestamp = Date.now();
    } catch (error) {
      console.error("Failed to initialize pool cache:", error);
    }
  }
  async refreshCacheIfNeeded() {
    if (Date.now() - this.cacheTimestamp > this.CACHE_TTL) {
      await this.initializeTokenCache();
      await this.initializePoolCache();
    }
  }
  async getTokenAddress(symbolOrName) {
    await this.refreshCacheIfNeeded();
    const key = symbolOrName.toLowerCase();
    const address = this.tokenCache.get(key);
    console.log("key", key);
    if (!address) {
      throw new Error(`Token ${symbolOrName} not found`);
    }
    return address;
  }
  async getPoolAddress(pairSymbol) {
    await this.refreshCacheIfNeeded();
    const key = pairSymbol.toLowerCase();
    const address = this.poolCache.get(key);
    if (!address) {
      throw new Error(`Pool for pair ${pairSymbol} not found`);
    }
    return address;
  }
  async get(_runtime, message, _state) {
    try {
      const content = typeof message.content === "string" ? message.content : message.content?.text;
      if (!content) {
        throw new Error("No message content provided");
      }
      const tokenIdentifier = this.extractToken(content);
      const pairIdentifier = this.extractPair(content);
      console.log("Extracted token identifier:", tokenIdentifier);
      console.log("pair Identifier", pairIdentifier);
      if (pairIdentifier) {
        const poolAddress = await this.getPoolAddress(pairIdentifier);
        const pairData = await this.fetchPairPrice(poolAddress);
        return this.formatPairPriceData(pairIdentifier, pairData);
      } else if (tokenIdentifier) {
        const isAddress = /^EQ[a-zA-Z0-9_-]{48}$/.test(tokenIdentifier);
        let tokenAddress;
        let tokenName;
        if (isAddress) {
          tokenAddress = tokenIdentifier;
          tokenName = await this.getTokenNameByAddress(tokenAddress);
        } else {
          tokenName = tokenIdentifier;
          tokenAddress = await this.getTokenAddress(tokenName);
        }
        const tokenData = await this.fetchTokenPrice(tokenAddress);
        return this.formatTokenPriceData(tokenName, tokenAddress, tokenData);
      } else {
        return "No token or pair identifier found in the message.";
      }
    } catch (error) {
      console.error("TonTokenPriceProvider error:", error);
      return `Error: ${error.message}`;
    }
  }
  extractPair(content) {
    const patterns = [
      /(?:price|value|worth|valuation|rate)\s+(?:of|for|on)\s+["']?(.+?)\/(.+?)(?:["']|\b)/i,
      /(?:what'?s?|what is|check|show|tell me)\s+(?:the )?(?:price|value|worth)\s+(?:of|for|on)\s+["']?(.+?)\/(.+?)(?:["']|\b)/i,
      /(?:how (?:much|is|does)\s+["']?(.+?)\/(.+?)(?:["']|\b)\s+(?:cost|worth|value|priced))/i
    ];
    const normalizedContent = content.replace(/[.,!?;](?=\s|$)/g, "").replace(/\s{2,}/g, " ");
    for (const pattern of patterns) {
      const match = normalizedContent.match(pattern);
      if (match) {
        const token1 = match[1]?.trim();
        const token2 = match[2]?.trim();
        if (token1 && token2) {
          return `${this.normalizeToken(token1)}/${this.normalizeToken(
            token2
          )}`;
        }
      }
    }
    return null;
  }
  extractToken(content) {
    const patterns = [
      // 1. Direct address matches (TON format)
      /\b(EQ[a-zA-Z0-9_-]{48})\b/i,
      // 2. Explicit symbol matches
      /(?:\$|#|token:?|symbol:?)\s*([a-z0-9]+(?:\s+[a-z0-9]+)*)/i,
      // 3. Price request patterns
      /(?:price|value|worth|valuation|rate)\s+(?:of|for|on)\s+["']?(.+?)(?:["']|\b)(?:\s+token)?(?: right now| today| currently)?/i,
      /(?:what'?s?|what is|check|show|tell me)\s+(?:the )?(?:price|value|worth)\s+(?:of|for|on)\s+["']?(.+?)(?:["']|\b)/i,
      /(?:how (?:much|is|does)\s+["']?(.+?)(?:["']|\b)\s+(?:cost|worth|value|priced))/i,
      // 4. Natural language patterns
      /(?:about|regarding|for|on)\s+["']?(the\s+)?(.+?)(?:["']|\b)(?:\s+token)?(?:\s+price| value| worth)/i,
      /\b(?:looking|want)\s+to\s+know\s+(?:the )?(?:price|value)\s+(?:of|for)\s+["']?(.+?)(?:["']|\b)/i
    ];
    const normalizedContent = content.replace(/[.,!?;](?=\s|$)/g, "").replace(/\s{2,}/g, " ");
    for (const pattern of patterns) {
      const match = normalizedContent.match(pattern);
      if (match) {
        const token = match.slice(1).find((g) => g?.trim());
        if (token) {
          console.log("token", token);
          const normalizedToken = token.replace(/^(the|a|an)\s+/i, "").replace(/\s+(token|coin|currency)$/i, "").trim();
          console.log("normalizedToken", normalizedToken);
          if (normalizedToken.includes("/")) {
            return null;
          }
          return this.normalizeToken(normalizedToken);
        }
      }
    }
    return null;
  }
  normalizeToken(token) {
    const replacements = {
      notcoin: "NOT",
      "not coin": "NOT",
      dedust: "DDST",
      "de dust": "DDST",
      jetton: "JETTON",
      toncoin: "TON",
      "the ton": "TON",
      dogscoin: "DOGS"
    };
    return replacements[token.toLowerCase()] || token.toUpperCase();
  }
  async getTokenNameByAddress(address) {
    const apiUrl = `https://tonapi.io/v2/jettons/${address}`;
    try {
      const response = await fetch(apiUrl);
      if (!response.ok) {
        throw new Error(`API request failed: ${response.status}`);
      }
      const data = await response.json();
      return data.metadata?.name || address;
    } catch (error) {
      console.error("Token metadata fetch error:", error);
      return address;
    }
  }
  async fetchTokenPrice(tokenAddress) {
    try {
      const endpoint = `${this.TONAPI_ENDPOINT}/rates?tokens=${tokenAddress}&currencies=usd`;
      const response = await fetch(endpoint, {
        headers: {
          Accept: "application/json",
          "Accept-Encoding": "gzip"
        }
      });
      const buffer = await response.arrayBuffer();
      const nodeBuffer = Buffer.from(buffer);
      try {
        const directText = new TextDecoder().decode(nodeBuffer);
        return JSON.parse(directText);
      } catch (e) {
        console.log("Direct parsing failed, trying decompression...");
        try {
          const decompressed = await gunzipAsync(nodeBuffer);
          const text = decompressed.toString("utf-8");
          return JSON.parse(text);
        } catch (decompressError) {
          console.error("Decompression failed:", decompressError);
          throw new Error("Failed to decompress response");
        }
      }
    } catch (error) {
      console.error("Fetch error:", error);
      throw error;
    }
  }
  async fetchPairPrice(poolAddress) {
    try {
      const response = await fetch(
        `${this.DEXSCREENER_API_ENDPOINT}/${poolAddress}`
      );
      if (!response.ok) {
        throw new Error(`API request failed: ${response.status}`);
      }
      const data = await response.json();
      return data;
    } catch (error) {
      console.error("Fetch pair price error:", error);
      throw error;
    }
  }
  formatPairPriceData(pairSymbol, data) {
    const pairData = data.pairs[0];
    if (!pairData) {
      throw new Error(`No price data found for pair ${pairSymbol}`);
    }
    const priceNative = pairData.priceNative;
    const priceUsd = pairData.priceUsd;
    const priceChange = pairData.priceChange;
    return `Pair: ${pairSymbol}
            Price (Native): ${priceNative}
            Price (USD): ${priceUsd}
            1h Change: ${priceChange.h1}%
            6h Change: ${priceChange.h6}%
            24h Change: ${priceChange.h24}%`;
  }
  formatTokenPriceData(tokenName, tokenAddress, data) {
    const tokenData = data.rates[tokenAddress];
    if (!tokenData) {
      throw new Error(`No price data found for token ${tokenName}`);
    }
    const price = tokenData.prices.USD.toFixed(6);
    const diff24h = tokenData.diff_24h.USD;
    const diff7d = tokenData.diff_7d.USD;
    const diff30d = tokenData.diff_30d.USD;
    return ` Current price: $${price} USD
             24h change: ${diff24h}
             7d change: ${diff7d}
             30d change: ${diff30d}`;
  }
};
var tonTokenPriceProvider = new TonTokenPriceProvider();

// src/actions/tokenPrice.ts
var priceTemplate = `Respond with a JSON markdown block containing only the extracted values. Use null for any values that cannot be determined.

Example response:
\`\`\`json
{
    "token": "TON"
}
\`\`\`

{{recentMessages}}

Given the recent messages, extract the following information about the requested token price:
- Token symbol or address

Respond with a JSON markdown block containing only the extracted values.`;
var tokenPrice_default = {
  name: "GET_TOKEN_PRICE_TON",
  similes: [
    "FETCH_TOKEN_PRICE_TON",
    "CHECK_TOKEN_PRICE_TON",
    "TOKEN_PRICE_TON"
  ],
  description: "Fetches and returns token price information on TON blockchain",
  handler: async (runtime, message, state, _options, callback) => {
    console.log("token price action handler started");
    elizaLogger24.log("Starting GET_TOKEN_PRICE_TON handler...");
    try {
      const provider = runtime.providers.find(
        (p) => p instanceof TonTokenPriceProvider
      );
      if (!provider) {
        throw new Error("Token price provider not found");
      }
      const priceData = await provider.get(runtime, message, state);
      console.log(priceData);
      if (callback) {
        callback({
          text: priceData,
          content: {
            success: true,
            priceData
          }
        });
      }
      return true;
    } catch (error) {
      console.error("Error during price fetch:", error);
      if (callback) {
        callback({
          text: `Error fetching token price: ${error.message}`,
          content: { error: error.message }
        });
      }
      return false;
    }
  },
  template: priceTemplate,
  validate: async (_runtime, message) => {
    const content = typeof message.content === "string" ? message.content : message.content?.text;
    console.log("content", content);
    if (!content) return false;
    const priceKeywords = /\b(price|market|status|situation|data|stats|insights|update|check)\b/i;
    const questionWords = /\b(what'?s|how'?s|give|show|tell|check)\b/i;
    const tokenSymbols = /\b(TON|NOT|NOTCOIN|DDST|DEDUST|DOGS|STON)\b/i;
    const hasContext = priceKeywords.test(content);
    const hasQuestion = questionWords.test(content);
    const hasToken = tokenSymbols.test(content);
    console.log(
      "hasContext,",
      hasContext,
      "hasQuestion ",
      hasQuestion,
      hasToken
    );
    return hasToken && (hasContext || hasQuestion);
  },
  examples: [
    [
      {
        user: "{{user1}}",
        content: {
          text: "Hey, could you check TON market data?",
          action: "GET_TOKEN_PRICE_TON"
        }
      },
      {
        user: "{{system}}",
        content: {
          text: "\u{1F4CA} Analyzing TON market data...",
          action: "GET_TOKEN_PRICE_TON"
        }
      },
      {
        user: "{{system}}",
        content: {
          text: "\u{1F4C8} TON Market Update:\n\u2022 Current Price: $5.67 (+5.43% 24h)\n\u2022 Volume: $1.87B\n\u2022 Liquidity: $233M\n\u2022 Market Cap: $7.8B",
          metadata: {
            price: 5.67,
            change_24h: 5.43,
            volume_24h: 187e7,
            liquidity: 233e6,
            market_cap: 78e8
          }
        }
      }
    ],
    [
      {
        user: "{{user1}}",
        content: {
          text: "give me a quick update on the notcoin situation",
          action: "GET_TOKEN_PRICE_TON"
        }
      },
      {
        user: "{{system}}",
        content: {
          text: "\u{1F50D} Fetching Notcoin stats...",
          action: "GET_TOKEN_PRICE_TON"
        }
      },
      {
        user: "{{system}}",
        content: {
          text: "NOT Token Status:\nPrice: $0.0003 | 24h: +2.19%\nLiquidity Pool: $15M\nDaily Volume: $1M\nMarket Rank: #892",
          metadata: {
            price: 3e-4,
            change_24h: 2.19,
            liquidity: 15e6,
            volume_24h: 1e6,
            rank: 892
          }
        }
      }
    ],
    [
      {
        user: "{{user1}}",
        content: {
          text: "what's happening with dedust price?",
          action: "GET_TOKEN_PRICE_TON"
        }
      },
      {
        user: "{{system}}",
        content: {
          text: "\u26A1 Getting DeDust market insights...",
          action: "GET_TOKEN_PRICE_TON"
        }
      },
      {
        user: "{{system}}",
        content: {
          text: "DeDust (DDST)\nTrading at: $1.23\nTrend: -2.5% (24h)\nVolume: $892K\nPool: $4.2M\nHolder Count: 15.2K",
          metadata: {
            price: 1.23,
            change_24h: -2.5,
            volume_24h: 892e3,
            liquidity: 42e5,
            holders: 15200
          }
        }
      }
    ]
  ]
};

// src/providers/tonConnect.ts
import {
  TonConnect,
  isWalletInfoRemote,
  UserRejectsError
} from "@tonconnect/sdk";
import NodeCache2 from "node-cache";
var PROVIDER_CONFIG2 = {
  BRIDGE_URL: "https://bridge.tonapi.io/bridge",
  MAX_RETRIES: 3,
  RETRY_DELAY: 2e3,
  CACHE_TTL: {
    DEFAULT_FILE_CACHE: 86400,
    // 24 hours
    DEFAULT_MEMORY_CACHE: 3600,
    // 1 hour
    CONNECTION: 86400
    // 24 hours
  }
};
var CACHE_KEYS = {
  CACHE_KEY: "ton/connect",
  CURRENT_WALLET: "currentWallet",
  CONNECTOR: "connector"
};
var CacheManager = class {
  constructor(memoryCache, fileCache, baseCacheKey, defaultTTL) {
    this.memoryCache = memoryCache;
    this.fileCache = fileCache;
    this.baseCacheKey = baseCacheKey;
    this.defaultTTL = defaultTTL;
  }
  async get(key) {
    const cacheKey = `${this.baseCacheKey}/${key}`;
    const memoryCached = this.memoryCache.get(cacheKey);
    if (memoryCached) return memoryCached;
    const fileCached = await this.fileCache.get(cacheKey);
    if (fileCached) {
      this.memoryCache.set(cacheKey, fileCached);
      return fileCached;
    }
    return null;
  }
  async set(key, data, ttl) {
    const cacheKey = `${this.baseCacheKey}/${key}`;
    const expiresIn = ttl || this.defaultTTL;
    this.memoryCache.set(cacheKey, data, expiresIn);
    await this.fileCache.set(cacheKey, data, {
      expires: Date.now() + expiresIn * 1e3
    });
  }
  async delete(key) {
    const cacheKey = `${this.baseCacheKey}/${key}`;
    this.memoryCache.del(cacheKey);
    await this.fileCache.delete(cacheKey);
  }
  async clear() {
    this.memoryCache.flushAll();
    await this.fileCache.delete(`${this.baseCacheKey}/*`);
  }
};
var TonConnectStorage = class {
  constructor(cacheManager) {
    this.cacheManager = cacheManager;
  }
  async setItem(key, value) {
    await this.cacheManager.set(key, value, {
      expires: Date.now() + PROVIDER_CONFIG2.CACHE_TTL.CONNECTION * 1e3
    });
  }
  async getItem(key) {
    return await this.cacheManager.get(key);
  }
  async removeItem(key) {
    await this.cacheManager.delete(key);
  }
};
var TonConnectProvider = class _TonConnectProvider {
  static instance = null;
  connector;
  cacheManager;
  unsubscribe = null;
  bridgeUrl;
  manifestUrl;
  initialized = false;
  connected = false;
  constructor() {
    this.cacheManager = {};
    this.connector = {};
  }
  static getInstance() {
    if (!_TonConnectProvider.instance) {
      _TonConnectProvider.instance = new _TonConnectProvider();
    }
    return _TonConnectProvider.instance;
  }
  async initialize(manifestUrl, bridgeUrl, fileCache) {
    if (this.initialized) return;
    this.validateManifestUrl(manifestUrl);
    this.validateBridgeUrl(bridgeUrl);
    const memoryCache = new NodeCache2({
      stdTTL: PROVIDER_CONFIG2.CACHE_TTL.DEFAULT_MEMORY_CACHE,
      checkperiod: 60
    });
    this.cacheManager = new CacheManager(
      memoryCache,
      fileCache,
      CACHE_KEYS.CACHE_KEY,
      PROVIDER_CONFIG2.CACHE_TTL.DEFAULT_FILE_CACHE
    );
    await this.initializeConnection(manifestUrl, fileCache);
    this.initialized = true;
    this.bridgeUrl = bridgeUrl;
  }
  validateManifestUrl(url) {
    if (!url || !url.startsWith("http")) {
      throw new Error("Invalid manifest URL provided");
    }
  }
  validateBridgeUrl(url) {
    if (!url || !url.startsWith("http")) {
      throw new Error("Invalid bridge URL provided");
    }
  }
  async initializeConnection(manifestUrl, fileCache) {
    try {
      const storage = new TonConnectStorage(fileCache);
      this.connector = new TonConnect({ manifestUrl, storage });
      this.setupEventListeners();
    } catch (error) {
      console.error("Failed to initialize connection:", error);
    }
  }
  setupEventListeners() {
    this.unsubscribe = null;
    this.unsubscribe = this.connector.onStatusChange((wallet) => {
      if (wallet) {
        this.connected = true;
        this.setCachedData(CACHE_KEYS.CURRENT_WALLET, wallet);
      } else {
        this.connected = false;
        this.deleteCachedData(CACHE_KEYS.CURRENT_WALLET);
      }
    });
  }
  async fetchWithRetry(operation, retries = PROVIDER_CONFIG2.MAX_RETRIES) {
    for (let i = 0; i < retries; i++) {
      try {
        return await operation();
      } catch (error) {
        if (i === retries - 1) throw error;
        const delay = PROVIDER_CONFIG2.RETRY_DELAY * Math.pow(2, i);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
    throw new Error("Operation failed after max retries");
  }
  async getWalletInfoList() {
    const walletsList = await this.fetchWithRetry(
      () => this.connector.getWallets()
    );
    return walletsList;
  }
  async connect(walletName) {
    try {
      const walletsList = await this.fetchWithRetry(
        () => this.connector.getWallets()
      );
      const remoteWallets = walletsList.filter(
        isWalletInfoRemote
      );
      if (remoteWallets.length === 0) {
        throw new Error("No remote wallets available");
      }
      const walletUniversalLink = walletName ? remoteWallets.find((wallet) => wallet.name === walletName)?.universalLink : null;
      const walletConnectionSource = {
        universalLink: walletUniversalLink,
        bridgeUrl: this.bridgeUrl
      };
      const universalLink = this.connector.connect(
        walletConnectionSource
      );
      return universalLink;
    } catch (error) {
      this.handleError("Connection error", error);
      return null;
    }
  }
  async getCachedData(key) {
    return await this.cacheManager.get(key);
  }
  async setCachedData(key, data, ttl) {
    await this.cacheManager.set(key, data, ttl);
  }
  async deleteCachedData(key) {
    await this.cacheManager.delete(key);
  }
  async clearCache() {
    await this.cacheManager.clear();
  }
  handleError(context, error) {
    if (error instanceof UserRejectsError) {
      console.warn(`${context}: User rejected the operation`);
    } else {
      console.error(`${context}:`, error);
    }
  }
  async disconnect() {
    try {
      if (this.connector.connected) {
        await this.connector.disconnect();
      }
      if (this.unsubscribe) {
        this.unsubscribe();
        this.unsubscribe = null;
      }
      await this.clearCache();
    } catch (error) {
      this.handleError("Disconnection error", error);
    }
  }
  async formatConnectionStatus(runtime) {
    const wallet = await this.getCachedData(
      CACHE_KEYS.CURRENT_WALLET
    );
    if (!this.isConnected() || !wallet) {
      return {
        status: "Disconnected",
        walletInfo: null
      };
    }
    return {
      status: "Connected",
      walletInfo: wallet
    };
  }
  async sendTransaction(transaction) {
    if (!this.connector.connected) {
      throw new Error("Wallet not connected");
    }
    return await this.fetchWithRetry(async () => {
      try {
        return await this.connector.sendTransaction(transaction);
      } catch (error) {
        if (error instanceof UserRejectsError) {
          throw new Error("Transaction rejected by user");
        }
        throw error;
      }
    });
  }
  isConnected = () => this.connected;
  getWalletInfo = () => this.connector.wallet;
};
var initTonConnectProvider = async (runtime) => {
  const manifestUrl = runtime.getSetting(CONFIG_KEYS.TON_MANIFEST_URL) ?? null;
  if (!manifestUrl) {
    throw new Error("TON_MANIFEST_URL is not set");
  }
  const bridgeUrl = runtime.getSetting(CONFIG_KEYS.TON_BRIDGE_URL) ?? PROVIDER_CONFIG2.BRIDGE_URL;
  const provider = TonConnectProvider.getInstance();
  await provider.initialize(manifestUrl, bridgeUrl, runtime.cacheManager);
  return provider;
};
var tonConnectProvider = {
  async get(runtime, message, state) {
    if (!runtime.getSetting(CONFIG_KEYS.TON_MANIFEST_URL)) {
      return "TONCONNECT is not enabled.";
    }
    try {
      const provider = await initTonConnectProvider(runtime);
      return provider.formatConnectionStatus(runtime);
    } catch (error) {
      console.error("TON Connect provider error:", error);
      return "Unable to connect to TON wallet. Please try again later.";
    }
  }
};

// src/actions/tonConnect.ts
import {
  elizaLogger as elizaLogger25,
  GoalStatus
} from "@elizaos/core";
import QRCode from "qrcode";
import { toUserFriendlyAddress } from "@tonconnect/sdk";
var connectAction = {
  name: "TON_CONNECT",
  similes: [
    "TON_CONNECT",
    "USE_TON_CONNECT",
    "CONNECT_TON_WALLET",
    "TON_CONNECT_WALLET"
  ],
  description: "connect to ton wallet with tonconnect",
  validate: async (runtime, message) => {
    if (!runtime.getSetting("TON_MANIFEST_URL")) {
      return false;
    }
    const existingGoals = await runtime.databaseAdapter.getGoals({
      agentId: runtime.agentId,
      roomId: message.roomId,
      userId: message.userId,
      onlyInProgress: true
    });
    const tonConnectGoal = existingGoals.find(
      (g) => g.name === "TON_CONNECT_WALLET"
    );
    if (tonConnectGoal) {
      return ["FAILED", "COMPLETED"].includes(tonConnectGoal.status);
    }
    const tonConnectProvider2 = await initTonConnectProvider(runtime);
    return !!tonConnectProvider2;
  },
  handler: async (runtime, message, state, _options, callback) => {
    if (!runtime.getSetting("TON_MANIFEST_URL")) {
      return false;
    }
    if (!state) {
      state = await runtime.composeState(message);
    } else {
      state = await runtime.updateRecentMessageState(state);
    }
    elizaLogger25.log("Starting TON_CONNECT handler...");
    const connectorStatus = await tonConnectProvider.get(
      runtime,
      message,
      state
    );
    if (!connectorStatus) {
      callback?.({
        text: "Error connecting to TON wallet. Please try again later."
      });
      return true;
    }
    state.connectorStatus = connectorStatus;
    const { status, walletInfo } = connectorStatus;
    const tonConnectProvider2 = await initTonConnectProvider(runtime);
    if (status === "Connected" && walletInfo) {
      callback?.({
        text: `Current wallet status: Connected
Address: ${toUserFriendlyAddress(walletInfo.account.address)}
Raw Address: ${walletInfo.account.address}
Chain: ${walletInfo.account.chain}
Platform: ${walletInfo.device.platform}
App: ${walletInfo.device.appName || "Unknown"}`
      });
      return true;
    }
    if (status === "Disconnected" && tonConnectProvider2) {
      const unified = await tonConnectProvider2.connect();
      const qrCodeData = await QRCode.toDataURL(unified);
      callback?.({
        text: `Please connect your TON wallet using this link:
${unified}`,
        attachments: [
          {
            id: crypto.randomUUID(),
            url: qrCodeData,
            title: "TON Wallet Connect QR Code",
            source: "tonConnect",
            description: "Scan this QR code with your TON wallet",
            contentType: "image/png",
            text: "Scan this QR code with your TON wallet"
          }
        ]
      });
      return true;
    }
    if (status === "Connecting") {
      callback?.({
        text: "Connecting to TON wallet..."
      });
      return true;
    }
    return true;
  },
  examples: [
    // Example 1: Initial connection request
    [
      {
        user: "{{user1}}",
        content: {
          text: "Connect my TON wallet",
          action: "TON_CONNECT"
        }
      },
      {
        user: "{{user2}}",
        content: {
          text: "Please connect your TON wallet using this link:\nhttps://app.tonkeeper.com/connect/example-universal-link"
        }
      }
    ],
    // Example 2: Successful connection
    [
      {
        user: "{{user1}}",
        content: {
          text: "Check my TON wallet connection",
          action: "TON_CONNECT"
        }
      },
      {
        user: "{{user2}}",
        content: {
          text: "Connected to TON wallet:\nAddress: EQCGScrZe1xbyWqWDvdI6mzP-GAcAWFv6ZXuaJOuSqemxku4\nChain: mainnet\nPlatform: web"
        }
      }
    ],
    // Example 3: Connection in progress
    [
      {
        user: "{{user1}}",
        content: {
          text: "Link TON wallet",
          action: "TON_CONNECT"
        }
      },
      {
        user: "{{user2}}",
        content: {
          text: "Connecting to TON wallet..."
        }
      }
    ],
    // Example 4: Error case
    [
      {
        user: "{{user1}}",
        content: {
          text: "Connect wallet",
          action: "TON_CONNECT"
        }
      },
      {
        user: "{{user2}}",
        content: {
          text: "Error connecting to TON wallet. Please try again later."
        }
      }
    ]
  ]
};
var disconnectAction = {
  name: "TON_DISCONNECT",
  similes: [
    "TON_DISCONNECT",
    "DISCONNECT_TON_WALLET",
    "DISCONNECT_WALLET",
    "LOGOUT_TON_WALLET"
  ],
  description: "disconnect from connected ton wallet",
  validate: async (runtime, message) => {
    if (!runtime.getSetting("TON_MANIFEST_URL")) {
      return false;
    }
    const tonConnectProvider2 = await initTonConnectProvider(runtime);
    if (!tonConnectProvider2) return false;
    return tonConnectProvider2.isConnected();
  },
  handler: async (runtime, message, state, _options, callback) => {
    if (!runtime.getSetting("TON_MANIFEST_URL")) {
      return false;
    }
    if (!state) {
      state = await runtime.composeState(message);
    } else {
      state = await runtime.updateRecentMessageState(state);
    }
    elizaLogger25.log("Starting TON_DISCONNECT handler...");
    const tonConnectProvider2 = await initTonConnectProvider(runtime);
    if (!tonConnectProvider2) {
      callback?.({
        text: "Error disconnecting from TON wallet. Wallet provider not initialized."
      });
      return true;
    }
    try {
      await tonConnectProvider2.disconnect();
      callback?.({
        text: "Successfully disconnected from TON wallet."
      });
    } catch (error) {
      callback?.({
        text: "Error disconnecting from TON wallet. Please try again later."
      });
    }
    return true;
  },
  examples: [
    // Example 1: Successful disconnection
    [
      {
        user: "{{user1}}",
        content: {
          text: "Disconnect my TON wallet",
          action: "TON_DISCONNECT"
        }
      },
      {
        user: "{{user2}}",
        content: {
          text: "Successfully disconnected from TON wallet."
        }
      }
    ],
    // Example 2: Error case
    [
      {
        user: "{{user1}}",
        content: {
          text: "Disconnect wallet",
          action: "TON_DISCONNECT"
        }
      },
      {
        user: "{{user2}}",
        content: {
          text: "Error disconnecting from TON wallet. Please try again later."
        }
      }
    ]
  ]
};
var showConnectionStatusAction = {
  name: "TON_CONNECTION_STATUS",
  similes: [
    "TON_STATUS",
    "WALLET_STATUS",
    "CHECK_TON_CONNECTION",
    "SHOW_WALLET_STATUS"
  ],
  description: "show current TON wallet connection status",
  validate: async (runtime, _message) => {
    if (!runtime.getSetting("TON_MANIFEST_URL")) {
      return false;
    }
    const tonConnectProvider2 = await initTonConnectProvider(runtime);
    return !!tonConnectProvider2;
  },
  handler: async (runtime, message, state, _options, callback) => {
    if (!state) {
      state = await runtime.composeState(message);
    } else {
      state = await runtime.updateRecentMessageState(state);
    }
    elizaLogger25.log("Starting TON_CONNECTION_STATUS handler...");
    const connectorStatus = await tonConnectProvider.get(
      runtime,
      message,
      state
    );
    if (!connectorStatus) {
      callback?.({
        text: "Unable to fetch wallet connection status."
      });
      return true;
    }
    const { status, walletInfo } = connectorStatus;
    switch (status) {
      case "Connected":
        if (walletInfo) {
          callback?.({
            text: `Current wallet status: Connected
Address: ${toUserFriendlyAddress(
              walletInfo.account.address
            )}
Raw Address: ${walletInfo.account.address}
Chain: ${walletInfo.account.chain}
Platform: ${walletInfo.device.platform}
App: ${walletInfo.device.appName || "Unknown"}`
          });
        }
        break;
      case "Connecting":
        callback?.({
          text: "Wallet status: Connection in progress..."
        });
        break;
      case "Disconnected":
        callback?.({
          text: "Wallet status: Not connected\nUse TON_CONNECT to connect your wallet."
        });
        break;
      default:
        callback?.({
          text: `Wallet status: ${status}`
        });
    }
    return true;
  },
  examples: [
    // Example 1: Connected wallet status
    [
      {
        user: "{{user1}}",
        content: {
          text: "Show my wallet status",
          action: "TON_CONNECTION_STATUS"
        }
      },
      {
        user: "{{user2}}",
        content: {
          text: "Current wallet status: Connected\nAddress: EQCGScrZe1xbyWqWDvdI6mzP-GAcAWFv6ZXuaJOuSqemxku4\nChain: mainnet\nPlatform: web\nApp: Tonkeeper"
        }
      }
    ],
    // Example 2: Disconnected status
    [
      {
        user: "{{user1}}",
        content: {
          text: "Check wallet connection",
          action: "TON_CONNECTION_STATUS"
        }
      },
      {
        user: "{{user2}}",
        content: {
          text: "Wallet status: Not connected\nUse TON_CONNECT to connect your wallet."
        }
      }
    ],
    // Example 3: Connecting status
    [
      {
        user: "{{user1}}",
        content: {
          text: "What's my wallet status",
          action: "TON_CONNECTION_STATUS"
        }
      },
      {
        user: "{{user2}}",
        content: {
          text: "Wallet status: Connection in progress..."
        }
      }
    ]
  ]
};

// src/actions/tonConnectTransaction.ts
import {
  elizaLogger as elizaLogger26,
  composeContext as composeContext23,
  ModelClass as ModelClass23,
  generateObject as generateObject23
} from "@elizaos/core";
import {
  UserRejectsError as UserRejectsError2
} from "@tonconnect/sdk";
function isTonConnectSendTransactionContent(content) {
  console.log("Content for TonConnect transaction", content);
  if (!content.messages || !Array.isArray(content.messages)) {
    return false;
  }
  return content.messages.every(
    (message) => typeof message.address === "string" && typeof message.amount === "string"
  );
}
var tonConnectSendTransactionTemplate = `Respond with a JSON markdown block containing only the extracted values. Use null for any values that cannot be determined.

Example response:
\`\`\`json
{
    "validUntil": 1234567890,
    "network": "MAINNET",
    "from": "0:abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
    "messages": [
        {
            "address": "EQCGScrZe1xbyWqWDvdI6mzP-GAcAWFv6ZXuaJOuSqemxku4",
            "amount": "1000000000",
            "stateInit": "te6cckEBAQEAAgAAAEysuc0=",
            "payload": "te6cckEBAQEAAgAAAEysuc0="
        },
        {
            "address": "EQDmnxDMhId6v1Ofg_h5KR5coWlFG6e86Ro3pc7Tq4CA0-Jn",
            "amount": "2000000000",
            "stateInit": null,
            "payload": null
        }
    ]
}
\`\`\`

{{recentMessages}}

Given the recent messages, extract the following information about the requested transaction:
- List of messages with recipient addresses and amounts
- Convert all amounts to nanotons (1 TON = 1,000,000,000 nanotons)
- Optional stateInit (base64 encoded contract code)
- Optional payload (base64 encoded message body)
- Optional network specification (MAINNET or TESTNET)
- Optional from address
- Optional validUntil timestamp (in unix seconds)

Respond with a JSON markdown block containing only the extracted values.`;
var TonConnectSendTransactionAction = class {
  async sendTransaction(params, provider) {
    console.log(`Sending transaction via TonConnect`);
    if (!provider.isConnected()) {
      throw new Error("Please connect wallet to send the transaction!");
    }
    const transaction = {
      validUntil: params.validUntil || Math.floor(Date.now() / 1e3) + 60,
      network: params.network,
      from: params.from,
      messages: params.messages
    };
    try {
      const result = await provider.sendTransaction(transaction);
      console.log("Transaction sent successfully");
      return result.boc;
    } catch (error) {
      if (error instanceof UserRejectsError2) {
        throw new Error(
          "You rejected the transaction. Please confirm it to send to the blockchain"
        );
      }
      throw new Error(`Unknown error happened: ${error.message}`);
    }
  }
};
var buildTonConnectSendTransactionDetails = async (runtime, message, state) => {
  let currentState = state;
  if (!currentState) {
    currentState = await runtime.composeState(message);
  } else {
    currentState = await runtime.updateRecentMessageState(currentState);
  }
  const transactionSchema = z.object({
    validUntil: z.number().optional(),
    network: z.enum(["MAINNET", "TESTNET"]).optional(),
    from: z.string().optional(),
    messages: z.array(
      z.object({
        address: z.string(),
        amount: z.string(),
        stateInit: z.string().optional(),
        payload: z.string().optional()
      })
    )
  });
  const transactionContext = composeContext23({
    state,
    template: tonConnectSendTransactionTemplate
  });
  const content = await generateObject23({
    runtime,
    context: transactionContext,
    schema: transactionSchema,
    modelClass: ModelClass23.SMALL
  });
  return content.object;
};
var tonConnectTransaction_default = {
  name: "SEND_TRANSACTION_TONCONNECT",
  similes: ["SEND_TX_TONCONNECT", "SEND_TRANSACTION_TC"],
  description: "Send any transaction using TonConnect wallet integration.",
  handler: async (runtime, message, state, _options, callback) => {
    elizaLogger26.log("Starting SEND_TRANSACTION_TONCONNECT handler...");
    if (!runtime.getSetting("TON_MANIFEST_URL")) {
      return false;
    }
    try {
      const provider = await initTonConnectProvider(runtime);
      if (!provider.isConnected()) {
        if (callback) {
          callback({
            text: "Please connect your wallet first using the TON_CONNECT action.",
            content: { error: "Wallet not connected" }
          });
        }
        return false;
      }
      const transactionDetails = await buildTonConnectSendTransactionDetails(
        runtime,
        message,
        state
      );
      if (!isTonConnectSendTransactionContent(transactionDetails)) {
        console.error(
          "Invalid content for SEND_TRANSACTION_TONCONNECT action."
        );
        if (callback) {
          callback({
            text: "Unable to process transaction request. Invalid content provided.",
            content: { error: "Invalid transaction content" }
          });
        }
        return false;
      }
      const action = new TonConnectSendTransactionAction();
      const boc = await action.sendTransaction(
        transactionDetails,
        provider
      );
      if (callback) {
        callback({
          text: `Successfully sent transaction. Transaction: ${boc}`,
          content: {
            success: true,
            boc,
            transaction: transactionDetails
          }
        });
      }
      return true;
    } catch (error) {
      console.error("Error during transaction:", error);
      if (callback) {
        callback({
          text: `Error sending transaction: ${error.message}`,
          content: { error: error.message }
        });
      }
      return false;
    }
  },
  template: tonConnectSendTransactionTemplate,
  validate: async (_runtime) => {
    return true;
  },
  examples: [
    [
      {
        user: "{{user1}}",
        content: {
          text: "Send 1 TON to EQCGScrZe1xbyWqWDvdI6mzP-GAcAWFv6ZXuaJOuSqemxku4 with payload te6cckEBAQEAAgAAAEysuc0=",
          action: "SEND_TRANSACTION_TONCONNECT"
        }
      },
      {
        user: "{{user2}}",
        content: {
          text: "Processing transaction via TonConnect...",
          action: "SEND_TRANSACTION_TONCONNECT"
        }
      },
      {
        user: "{{user2}}",
        content: {
          text: "Successfully sent transaction. Transaction: c8ee4a2c1bd070005e6cd31b32270aa461c69b927c3f4c28b293c80786f78b43"
        }
      }
    ]
  ]
};

// src/index.ts
var tonPlugin = {
  name: "ton",
  description: "Ton Plugin for Eliza",
  actions: [
    transfer_default,
    createWallet_default,
    loadWallet_default,
    stake_default,
    unstake_default,
    evaaBorrow_default,
    evaaSupply_default,
    evaaWithdraw_default,
    evaaRepay_default,
    evaaPositions_default,
    getPoolInfo_default,
    batchTransfer_default,
    connectAction,
    disconnectAction,
    showConnectionStatusAction,
    tonConnectTransaction_default,
    tokenPrice_default,
    //auctionAction as Action,
    createListing_default,
    createAuction_default,
    bidListing_default,
    buyListing_default,
    cancelListing_default,
    auctionInteraction_default,
    transferNFT_default,
    mintNFT_default,
    updateNFTMetadata_default,
    getCollectionData_default
  ],
  evaluators: [],
  providers: [
    nativeWalletProvider,
    nativeStakingProvider,
    tonConnectProvider,
    tonTokenPriceProvider
  ]
};
var index_default = tonPlugin;
export {
  auctionInteraction_default as AuctionInteractionActionTon,
  batchTransfer_default as BatchTransferTokens,
  createWallet_default as CreateTonWallet,
  getCollectionData_default as GetCollectionData,
  getPoolInfo_default as GetPoolInfoTonToken,
  tokenPrice_default as GetTokenPrice,
  loadWallet_default as LoadTonWallet,
  mintNFT_default as MintNFT,
  stake_default as StakeTonToken,
  StakingProvider,
  transferNFT_default as TransferNFT,
  transfer_default as TransferTonToken,
  unstake_default as UnstakeTonToken,
  updateNFTMetadata_default as UpdateNFTMetadata,
  WalletProvider,
  index_default as default,
  tonPlugin
};
//# sourceMappingURL=index.js.map