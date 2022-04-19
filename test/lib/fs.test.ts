import { trimPathSeparators } from '../../src/lib/fs';

describe('fs', () => {
  test('trimPathSeparators POSIX', () => {
    expect(trimPathSeparators('/foo/bar/baz')).toBe('foo/bar/baz');
    expect(trimPathSeparators('foo/bar/baz/')).toBe('foo/bar/baz');
    expect(trimPathSeparators('/foo/bar/baz/')).toBe('foo/bar/baz');
    expect(trimPathSeparators('foo/bar/baz')).toBe('foo/bar/baz');
  });
});
