import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  ApiError,
  email,
  password,
  hashPassword,
  verifyPassword,
  token,
  digest,
  financialPosting,
  Limiter
} from './security.ts';

test('email validation', () => {
  assert.equal(email('USER@example.com'), 'user@example.com');
  assert.throws(() => email('invalid-email'), ApiError);
});

test('password validation', () => {
  assert.equal(password('SecurePass123!'), 'SecurePass123!');
  assert.throws(() => password('short'), ApiError);
});

test('password hashing and verification', async () => {
  const stored = await hashPassword('SecurePass123!');
  assert.notEqual(stored, 'SecurePass123!');
  assert.equal(
    await verifyPassword('SecurePass123!', stored),
    true
  );
  assert.equal(
    await verifyPassword('WrongPassword123!', stored),
    false
  );
});

test('tokens are random', () => {
  assert.notEqual(token(), token());
});

test('digest is deterministic', () => {
  assert.equal(digest('abc'), digest('abc'));
  assert.notEqual(digest('abc'), digest('xyz'));
});

test('financial posting remains disabled', () => {
  assert.throws(
    () => financialPosting(),
    (error: unknown) =>
      error instanceof ApiError && error.status === 503
  );
});

test('rate limiter blocks excessive requests', () => {
  const limiter = new Limiter(2, 60000);
  assert.equal(limiter.allow('test-user'), true);
  assert.equal(limiter.allow('test-user'), true);
  assert.equal(limiter.allow('test-user'), false);
});
