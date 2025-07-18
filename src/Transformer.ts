export class TransformError extends Error {}

interface TypeDescriptor {
  /** Any class constructor including built in (String, Number, Boolean, Date e.t.c) */
  type?: { new (): any }

  /** Describes type of elements in collection. <br />
   * If Schema[property] is Map, Set or Array, than property "of" describes the type of elements in collection. <br />
   * I.e. Array<Schema[property]['off']> <br />
   * If not specified, the values from json will be used "as is".
   *   */
  of?: { new (): unknown }

  /** Will `throw` if type of value in json doesn't match schema. <br/>
   * Otherwise, the value in json will be used "as is". <br />
   * Is considering "true" by default. <br />
   * Takes precedence over the parameter "strict", passed to the fromJSON method as third argument.
   * */
  strict?: boolean
}

/** Params for transforming collection elements */
interface ToCollectionElement {
  Type: { new (): any } | undefined
  throwable: boolean
  input: any
}

/** Describes expected behaviour during transformation,
 * and types of Target properties. <br />
 *
 * Use this only for `nullable properties`, or to describe `types of collections`. <br />
 * There is no reason to describe each property, is much better and easier to set default values.
 * */
export type Schema<T extends Object> = {
  [Property in keyof T]?: T[Property] extends Function ? never : TypeDescriptor
}

/** Transform json or plain object to class instance and vice versa */
export class Transformer {
  static #object = Object.create(null);
  static #primitives = new Set<Function>([String, Number, Boolean])

  static fromJSON<T extends Object>(json: JSON | Object, ctor: { new (): T }, strict = true): T {
    if (json == null || typeof json !== 'object') throw new TransformError('Invalid json');
    let instance!: T
    try {
      instance = new ctor();
    } catch (e) {
      throw new TransformError('Invalid constructor', { cause: e });
    }
    const Name = ctor.name;
    const types: Schema<T> = Reflect.get(ctor, 'types') || this.#object as Schema<T>;

    Object.keys(instance).forEach(property => {
      const descriptor = Reflect.getOwnPropertyDescriptor(instance, property) as PropertyDescriptor;
      if (!descriptor.writable && !descriptor.set) return;

      const typeDescriptor: TypeDescriptor = Reflect.get(types, property) || this.#object as TypeDescriptor
      const throwable = this.#shouldThrow(strict, typeDescriptor)

      // can't use descriptor value, cause property can be an enumerable getter
      let value = Reflect.get(instance, property)

      if (typeof value === 'function') return;
      const ValueTypeConstructor = typeDescriptor.type;

      // initial value is undefined or null
      if (value == null) {
        // property type is not declared
        if (!ValueTypeConstructor) {
          // if mode is strict, throw
          if (throwable) {
            throw new TransformError(`Initial value of "${property}" is null, but type is not declared in ${Name}.types.${property}.type`);
          }
          // if mode is not strict, leave initial value
          return
        } else {
          try {
            // if type is declared, we construct it. It will be filled bellow with value from json
            value = new ValueTypeConstructor();
          } catch (e) {
            throw new TransformError(`Invalid constructor in ${Name}.types.${property}.type for "${property}"`);
          }
        }
      }

      const jsonValue = Reflect.get(json, property)

      // if property doesn't exist in JSON and mode is strict, then throw
      if (typeof jsonValue === 'undefined' && throwable) {
        throw new TransformError(`Property "${property}" is missed in JSON but required in ${Name}`)
      }

      // if property exist in JSON, but value is null
      if (jsonValue == null) return;

      // now we are sure, that values in JSON and class are not undefined or null
      // checking if value is a primitive or created above with primitive constructor (String, Number or Boolean)
      if (Object(value) !== value || this.#primitives.has(value!.constructor)) {
        if (value!.constructor !== jsonValue.constructor) {
          // if types are not equal and mode is strict, then throw
          if (throwable) {
            throw new TransformError(`Type of "${property}" in JSON is not "${value.constructor}" as ${Name} expect`);
          }
          // if mode is not strict, then leave initial value
          // but value may be created with primitive constructor, that's why we use valueOf here
          // @ts-ignore
          return Reflect.set(instance, property, value.valueOf())
        }
        // if types are equal, using value from JSON
        return Reflect.set(instance, property, jsonValue)
      }

      // now the value is an Object, but it can be a collection

      // Getting declared type of Collection elements if exists
      const Type = Reflect.get(typeDescriptor, 'of')
      if (Array.isArray(value)) {
        if (!Array.isArray(jsonValue)) {
          // if json value is not Array, and mode is strict, then throw
          if (throwable) {
            throw new TransformError(`Type of "${property}" in JSON is not "Array" as ${Name} expect`);
          }
          // if mode is not strict, leave initial value
          return Reflect.set(instance, property, value);
        }

        try {
          for (const input of jsonValue) {
            value.push(this.#toElementType({ input, Type, throwable }));
          }
        } catch (e) {
          if (throwable) {
            throw new TransformError(`Cannot transform elements of ${Name}.${property}`, { cause: e });
          }
        }
        return Reflect.set(instance, property, value);
      }

      if (value instanceof Map) {
        if (jsonValue.constructor !== Object) {
          if (throwable) {
            throw new TransformError(`Type of "${property}" in JSON is not "Object" as ${Name} expect`);
          }
          return Reflect.set(instance, property, value);
        }

        try {
          for (const key in jsonValue) {
            const input = jsonValue[key]
            value.set(key, this.#toElementType({ input, Type, throwable }));
          }
        } catch (e) {
          if (throwable) {
            throw new TransformError(`Cannot transform elements of ${Name}.${property}`, { cause: e });
          }
        }
        return Reflect.set(instance, property, value);
      }

      if (value instanceof Set) {
        if (!Array.isArray(jsonValue)) {
          if (throwable) throw new TransformError(`Type of "${property}" in JSON is not "Array" as ${Name} expect`);
          return
        }

        try {
          for (const input of jsonValue) {
            value.add(this.#toElementType({ input, Type, throwable }));
          }
        } catch (e) {
          if (throwable) {
            throw new TransformError(`Cannot transform elements of ${Name}.${property}`, { cause: e });
          }
        }
        return Reflect.set(instance, property, value);
      }

      if (value instanceof Date) {
        if (typeof jsonValue !== 'string') {
          if (throwable) throw new TransformError(`Type of "${property}" in JSON is not "String" as ${Name} expect`);
          return
        }
        return Reflect.set(instance, property, new Date(jsonValue))
      }

      if (typeof jsonValue !== 'object' && throwable) {
        throw new TransformError(`Type of "${property}" in JSON is not "Object" as ${Name} expect`);
      }
      const proto = Reflect.getPrototypeOf(value as Object)
      // Consider that initial value is an object without prototype
      if (!proto.constructor) return Reflect.set(instance, property, jsonValue);
      return Reflect.set(instance, property, this.fromJSON(jsonValue, proto.constructor as { new (): Object }, throwable));
    })

    return instance
  }

  static #shouldThrow(strict = true, descriptor?: TypeDescriptor) {
    const value = Reflect.get(descriptor || {}, 'strict')
    return typeof value === 'boolean' ? value : strict
  }

  static #toElementType({ Type, throwable, input }: ToCollectionElement) {
    if (!Type) {
      return input
    } else if (Object(input) !== input) {
      return input
    } else if (Type === Date) {
      if (typeof input === 'string') return new Date(input)
      throw new TransformError(`Type of value in JSON is not "String" as ${Type?.name || ''} expect`);
    } else {
      return this.fromJSON(input, Type, throwable)
    }
  }

  static toJSON(instance: Object): JSON | Object {
    const result = {}
    Reflect.ownKeys(instance).forEach(property => {
      const value = Reflect.get(instance, property)
      if (typeof value === 'function') {
        return
      }
      if (typeof property === 'symbol') {
        return
      }
      if (Object(value) !== value) {
        return Reflect.set(result, property, value)
      }
      if (Array.isArray(value) || value instanceof Set) {
        const array: any[] = []
        value.forEach((item: any) => array.push(this.#toPlain(item)))
        return Reflect.set(result, property, array)
      }

      if (value instanceof Map) {
        const object = {}
        value.forEach((item, key) => Reflect.set(object, key, this.#toPlain(item)))
        return Reflect.set(result, property, object)
      }

      if (value instanceof Date) {
        return Reflect.set(result, property, value)
      }
      return Reflect.set(result, property, this.toJSON(value))
    })
    return JSON.parse(JSON.stringify(result))
  }

  static #toPlain = (item: any) => (Object(item) !== item ? item : this.toJSON(item))
}
