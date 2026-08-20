import { describe, it } from 'node:test';
import { Transformer, TransformError } from '../src';
import * as assert from 'node:assert/strict';

describe('Exceptions', () => {
  it('should throw if constructor was not provided', () => {
    const json = { foo: 'bar' };
    try {
      // @ts-ignore
      Transformer.fromJSON(json)
    } catch (error) {
      assert.equal(error instanceof TransformError, true);
    }
  })


  it('should throw if json was not provided', () => {
    class Target {}
    try {
      // @ts-ignore
      Transformer.fromJSON(null, Target)
    } catch (error) {
      assert.equal(error instanceof TransformError, true);
    }
  })

  it('should throw when default value is null, strict is true and type is not declared in descriptor', () => {
    class Target {
      a = null
    }
    try {
      Transformer.fromJSON({ a: 2 }, Target)
    } catch (error) {
      console.log(error)
      assert.equal(error instanceof TransformError, true);
    }
  })

  it('should throw when default value is null, strict is true and type declared in descriptor in not a valid constructor', () => {
    class Target {
      static types = { a: { type: true } }
      a = null
    }
    try {
      // @ts-ignore
      Transformer.fromJSON({ a: 2 }, Target)
    } catch (error) {
      assert.equal(error instanceof TransformError, true);
    }
  })


  it('should throw when Date is declared as type in "types" but value in json is not string', () => {
    class DateTest {
      static types = { map: { of: Date } }
      map = new Map<string, Date>()
    }

    try {
      Transformer.fromJSON({ map: { 1: true } }, DateTest)
    } catch (error) {
      assert.equal(error instanceof TransformError, true);
    }
  })


  it('should throw when property exists in target but not in source and strict is true', () => {
    class Target { a = '' }
    try {
      Transformer.fromJSON({ }, Target)
    } catch (error) {
      assert.equal(error instanceof TransformError, true);
    }
  })

  it('should throw when type of property in target is not the same as type of property in source and strict is true', () => {
    class Target { a = '' }
    try {
      Transformer.fromJSON({ a: 2 }, Target)
    } catch (error) {
      console.log(error)
      assert.equal(error instanceof TransformError, true);
    }
  })

  it('should throw when type of property in target is array but not in source, and strict is true', () => {
    class Target { a = [] }
    try {
      Transformer.fromJSON({ a: 2 }, Target)
    } catch (error) {
      console.log(error)
      assert.equal(error instanceof TransformError, true);
    }
  })

  it('should throw when type of property in target is Map but in source is not object, and strict is true', () => {
    class Target { a = new Map() }
    try {
      Transformer.fromJSON({ a: [] }, Target)
    } catch (error) {
      assert.equal(error instanceof TransformError, true);
    }

    try {
      Transformer.fromJSON({ a: true }, Target)
    } catch (error) {
      assert.equal(error instanceof TransformError, true);
    }
  })

  it('should throw when type of property in target is Set but not array in source, and strict is true', () => {
    class Target { a = new Set() }
    try {
      Transformer.fromJSON({ a: 2 }, Target)
    } catch (error) {
      assert.equal(error instanceof TransformError, true);
    }
  })

  it('should throw when type of property in target is Date but not string in source, and strict is true', () => {
    class Target { a = new Date() }
    try {
      Transformer.fromJSON({ a: 2 }, Target)
    } catch (error) {
      assert.equal(error instanceof TransformError, true);
    }
  })


  it('should throw if default value is an object without prototype but value in source is not object', () => {
    class Foo {
      bar = Object.create(null)
    }

    try {
      Transformer.fromJSON({ bar: 2 }, Foo)
    } catch (error) {
      assert.equal(error instanceof TransformError, true);
    }
  })


  it('should throw when descriptor.strict is true and strict is false', () => {
    class Foo {
      static types = { a: { strict: true } }
      a = ''
    }
    const json = { a: true }
    try {
      Transformer.fromJSON({ a: true }, Foo)
    } catch (error) {
      assert.equal(error instanceof TransformError, true);
    }
  })
})