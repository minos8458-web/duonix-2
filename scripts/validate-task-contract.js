#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const EXPECTED_PATHS = Object.freeze([
  '.github/workflows/duonix-validation.yml',
  'automation/contracts/tc-01-tooling-bootstrap.json',
  'scripts/validate-task-contract.js',
  'scripts/validate-changed-paths.js',
  'scripts/validate-tooling-bootstrap.js',
  'scripts/test-tooling-bootstrap.js',
  'state/TC-01-tooling-bootstrap.md',
]);

const EXPECTED_FORBIDDEN_OPERATIONS = Object.freeze([
  'DELETE',
  'RENAME',
  'MOVE',
  'FORCE_PUSH',
  'MERGE',
  'MAIN_WRITE',
  'RULESET_CHANGE',
  'BRANCH_PROTECTION_CHANGE',
]);

const EXPECTED = Object.freeze({
  schema_version: 1,
  task_id: 'TC-01',
  task_type: 'TOOLING_BOOTSTRAP',
  repository: 'minos8458-web/duonix-2',
  architecture_name: 'TC-01 TOOLING BOOTSTRAP ARCHITECTURE',
  architecture_version: '1.1',
  architecture_sha256: 'bdb69631dcd8fcecb22cc18b544e1109a891a6917b7f06e47259ba660878e205',
  required_base_sha: '8a08658222e19a5cb542f6d7975505c88ae72369',
  required_branch: 'automation/tc-01-tooling-bootstrap',
  required_pr_base_branch: 'automation/auto-001-bootstrap',
  expected_change_mode: 'EXACT_ADDITIVE_SET',
  final_success_state: 'VALIDATED / REVIEWED / AWAITING CONTROL TOWER OR USER DISPOSITION',
  checkout_action: 'actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1',
  setup_node_action: 'actions/setup-node@820762786026740c76f36085b0efc47a31fe5020',
  upload_artifact_action: 'actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a',
  evidence_files: Object.freeze([
    'tc01-validation-evidence.json',
    'changed-paths.txt',
    'changed-modes-raw.txt',
    'self-test-evidence.json',
  ]),
});

class ContractConfigError extends Error {}
class ContractEnvironmentError extends Error {}

function sameArray(actual, expected) {
  return Array.isArray(actual)
    && actual.length === expected.length
    && actual.every((value, index) => value === expected[index]);
}

function readContract(contractPath) {
  let source;
  try {
    source = fs.readFileSync(contractPath, 'utf8');
  } catch (error) {
    throw new ContractEnvironmentError(`cannot read contract ${contractPath}: ${error.message}`);
  }

  try {
    return JSON.parse(source);
  } catch (error) {
    throw new ContractConfigError(`malformed JSON contract ${contractPath}: ${error.message}`);
  }
}

function validateContract(contract) {
  const failures = [];
  const equal = (label, actual, expected) => {
    if (actual !== expected) {
      failures.push(`${label}: expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`);
    }
  };

  if (!contract || typeof contract !== 'object' || Array.isArray(contract)) {
    return ['contract root must be a JSON object'];
  }

  equal('schema_version', contract.schema_version, EXPECTED.schema_version);
  equal('task_id', contract.task_id, EXPECTED.task_id);
  equal('task_type', contract.task_type, EXPECTED.task_type);
  equal('repository', contract.repository, EXPECTED.repository);
  equal('architecture.name', contract.architecture?.name, EXPECTED.architecture_name);
  equal('architecture.version', contract.architecture?.version, EXPECTED.architecture_version);
  equal('architecture.sha256', contract.architecture?.sha256, EXPECTED.architecture_sha256);
  equal('required_base_sha', contract.required_base_sha, EXPECTED.required_base_sha);
  equal('required_branch', contract.required_branch, EXPECTED.required_branch);
  equal('required_pr_base_branch', contract.required_pr_base_branch, EXPECTED.required_pr_base_branch);
  equal('required_pr_base_sha', contract.required_pr_base_sha, EXPECTED.required_base_sha);
  equal('expected_change_mode', contract.expected_change_mode, EXPECTED.expected_change_mode);
  equal('auto_fix_allowed', contract.auto_fix_allowed, false);
  equal('max_auto_fix_cycles', contract.max_auto_fix_cycles, 1);
  equal('final_success_state', contract.final_success_state, EXPECTED.final_success_state);

  if (!sameArray(contract.allowed_paths, EXPECTED_PATHS)) {
    failures.push(`allowed_paths: expected exact ordered set ${JSON.stringify(EXPECTED_PATHS)}`);
  }
  if (!sameArray(contract.forbidden_operations, EXPECTED_FORBIDDEN_OPERATIONS)) {
    failures.push(`forbidden_operations: expected exact ordered list ${JSON.stringify(EXPECTED_FORBIDDEN_OPERATIONS)}`);
  }
  if (!sameArray(contract.eligible_auto_fix_failure_classes, [])) {
    failures.push('eligible_auto_fix_failure_classes: expected []');
  }

  equal('workflow.job_key', contract.workflow?.job_key, 'deterministic-validation');
  equal('workflow.job_name', contract.workflow?.job_name, 'deterministic-validation');
  equal('workflow.timeout_minutes', contract.workflow?.timeout_minutes, 10);
  equal('workflow.runner', contract.workflow?.runner, 'ubuntu-24.04');
  equal('workflow.node_version', contract.workflow?.node_version, '24.x');
  equal('workflow.runtime_evidence_directory', contract.workflow?.runtime_evidence_directory, '${RUNNER_TEMP}/tc01/');
  equal('workflow.permissions.contents', contract.workflow?.permissions?.contents, 'read');
  equal('workflow.checkout.action', contract.workflow?.checkout?.action, EXPECTED.checkout_action);
  equal('workflow.checkout.ref', contract.workflow?.checkout?.ref, 'CANDIDATE_SHA');
  equal('workflow.checkout.fetch_depth', contract.workflow?.checkout?.fetch_depth, 0);
  equal('workflow.checkout.persist_credentials', contract.workflow?.checkout?.persist_credentials, false);
  equal('workflow.setup_node_action', contract.workflow?.setup_node_action, EXPECTED.setup_node_action);
  equal('workflow.upload_artifact.action', contract.workflow?.upload_artifact?.action, EXPECTED.upload_artifact_action);
  equal('workflow.upload_artifact.name', contract.workflow?.upload_artifact?.name, 'tc-01-validation-evidence-<CANDIDATE_SHA>');
  equal('workflow.upload_artifact.retention_days', contract.workflow?.upload_artifact?.retention_days, 30);
  if (!sameArray(contract.workflow?.evidence_files, EXPECTED.evidence_files)) {
    failures.push(`workflow.evidence_files: expected exact ordered set ${JSON.stringify(EXPECTED.evidence_files)}`);
  }

  equal('validator_exit_codes.pass', contract.validator_exit_codes?.pass, 0);
  equal('validator_exit_codes.deterministic_validation_fail', contract.validator_exit_codes?.deterministic_validation_fail, 1);
  equal('validator_exit_codes.invalid_invocation_or_config', contract.validator_exit_codes?.invalid_invocation_or_config, 2);
  equal('validator_exit_codes.environment_or_precondition_blocked', contract.validator_exit_codes?.environment_or_precondition_blocked, 3);

  return failures;
}

function loadAndValidateContract(contractPath) {
  const resolvedPath = path.resolve(contractPath);
  const contract = readContract(resolvedPath);
  const failures = validateContract(contract);
  return { contract, failures, resolvedPath };
}

function printFailures(heading, failures) {
  console.error(heading);
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
}

function main(argv) {
  if (argv.length !== 1) {
    console.error('TC-01 task contract validation: CONFIG ERROR');
    console.error('usage: node scripts/validate-task-contract.js <contract.json>');
    return 2;
  }

  try {
    const { contract, failures, resolvedPath } = loadAndValidateContract(argv[0]);
    if (failures.length > 0) {
      printFailures('TC-01 task contract validation: FAIL', failures);
      return 1;
    }
    console.log('TC-01 task contract validation: PASS');
    console.log(`contract: ${resolvedPath}`);
    console.log(`task: ${contract.task_id} / ${contract.task_type}`);
    console.log(`allowed paths: ${contract.allowed_paths.length}`);
    return 0;
  } catch (error) {
    if (error instanceof ContractConfigError) {
      printFailures('TC-01 task contract validation: CONFIG ERROR', [error.message]);
      return 2;
    }
    printFailures('TC-01 task contract validation: BLOCKED', [error.message]);
    return 3;
  }
}

if (require.main === module) {
  process.exitCode = main(process.argv.slice(2));
}

module.exports = {
  ContractConfigError,
  ContractEnvironmentError,
  EXPECTED,
  EXPECTED_FORBIDDEN_OPERATIONS,
  EXPECTED_PATHS,
  loadAndValidateContract,
  validateContract,
};
