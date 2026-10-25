/**
 * Initial screening rules. This module intentionally does not define defaults
 * for finance policy. Pass only approved, versioned rules supplied by One Way.
 */
export function screenApplication(application, rules = null) {
  if (!rules || !rules.version || !Array.isArray(rules.criteria)) {
    return {
      status: 'needs_manual_review',
      reasonCodes: ['POLICY_NOT_CONFIGURED'],
      explanation: 'No approved eligibility policy is configured; manual review is required.',
      rulesVersion: 'unconfigured'
    };
  }

  const failures = [];
  const unknowns = [];
  for (const criterion of rules.criteria) {
    const value = criterion.path.split('.').reduce((item, key) => item?.[key], application);
    if (value === undefined || value === null || value === '') {
      unknowns.push(criterion.code);
    } else if (!criterion.test(value, application)) {
      failures.push(criterion.code);
    }
  }
  if (failures.length) return {
    status: 'does_not_meet_initial_criteria', reasonCodes: failures,
    explanation: 'One or more configured initial criteria were not met; this is not a final lending decision.',
    rulesVersion: rules.version
  };
  if (unknowns.length) return {
    status: 'needs_manual_review', reasonCodes: unknowns,
    explanation: 'Some configured criteria could not be evaluated; manual review is required.',
    rulesVersion: rules.version
  };
  return {
    status: 'potentially_eligible', reasonCodes: [],
    explanation: 'Configured initial criteria appear satisfied. Final approval requires company review.',
    rulesVersion: rules.version
  };
}
