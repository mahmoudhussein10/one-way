import test from 'node:test';
import assert from 'node:assert/strict';
import { screenApplication } from './eligibility.mjs';

test('missing company policy routes to manual review', () => {
  assert.equal(screenApplication({}).status, 'needs_manual_review');
  assert.deepEqual(screenApplication({}).reasonCodes, ['POLICY_NOT_CONFIGURED']);
});

test('configured criteria can identify a potentially eligible initial application', () => {
  const rules = { version: 'approved-1', criteria: [{ code: 'CATEGORY', path: 'applicant.category', test: v => v === 'business' }] };
  assert.equal(screenApplication({ applicant: { category: 'business' } }, rules).status, 'potentially_eligible');
});

test('missing configured answers require manual review and retain policy version', () => {
  const rules = { version: 'approved-2', criteria: [{ code: 'TENURE', path: 'business.years', test: v => v >= 2 }] };
  const result = screenApplication({ business: {} }, rules);
  assert.equal(result.status, 'needs_manual_review');
  assert.equal(result.rulesVersion, 'approved-2');
});

test('failed approved criterion returns an initial-screening outcome, not final rejection', () => {
  const rules = { version: 'approved-3', criteria: [{ code: 'TENURE', path: 'business.years', test: v => v >= 2 }] };
  const result = screenApplication({ business: { years: 1 } }, rules);
  assert.equal(result.status, 'does_not_meet_initial_criteria');
  assert.match(result.explanation, /not a final lending decision/);
});
