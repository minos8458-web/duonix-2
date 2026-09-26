#!/usr/bin/env node
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { loadAndValidateContract, ContractConfigError } = require('./validate-task-contract');

const repositoryRoot = path.resolve(__dirname, '..');

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd || repositoryRoot,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  });
  return {
    command: [command, ...args].join(' '),
    exit_code: result.error ? 3 : result.status,
    stdout: result.stdout || '',
    stderr: result.error ? `${result.stderr || ''}${result.error.message}\n` : (result.stderr || ''),
  };
}

function resolveCommit(revision) {
  const result = run('git', ['rev-parse', '--verify', `${revision}^{commit}`]);
  if (result.exit_code !== 0) {
    throw new Error(`cannot resolve commit ${revision}: ${result.stderr.trim()}`);
  }
  return result.stdout.trim();
}

function workflowFailures(contract) {
  const workflowPath = path.join(repositoryRoot, contract.allowed_paths[0]);
  let workflow;
  try {
    workflow = fs.readFileSync(workflowPath, 'utf8');
  } catch (error) {
    throw new Error(`cannot read workflow ${workflowPath}: ${error.message}`);
  }
  const failures = [];
  const requirePattern = (label, pattern) => {
    if (!pattern.test(workflow)) failures.push(`WORKFLOW_CONTRACT: missing ${label}`);
  };

  if (/pull_request_target\s*:/.test(workflow)) failures.push('WORKFLOW_CONTRACT: pull_request_target is forbidden');
  requirePattern('push branch', /push:[\s\S]*?branches:[\s\S]*?- automation\/tc-01-tooling-bootstrap/);
  requirePattern('pull request base branch', /pull_request:[\s\S]*?branches:[\s\S]*?- automation\/auto-001-bootstrap/);
  requirePattern('contents read permission', /permissions:\s*\n\s+contents:\s*read/);
  requirePattern('ubuntu-24.04 runner', /runs-on:\s*ubuntu-24\.04/);
  requirePattern('Node 24.x', /node-version:\s*24\.x/);
  requirePattern('immutable checkout action', new RegExp(contract.workflow.checkout.action.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  requirePattern('candidate checkout ref', /ref:\s*\$\{\{\s*env\.CANDIDATE_SHA\s*\}\}/);
  requirePattern('fetch-depth zero', /fetch-depth:\s*0/);
  requirePattern('credentials disabled', /persist-credentials:\s*false/);
  requirePattern('exact checkout verification', /git rev-parse HEAD/);
  requirePattern('immutable setup-node action', new RegExp(contract.workflow.setup_node_action.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  requirePattern('external runner temp evidence', /runner\.temp[^\n]*tc01|RUNNER_TEMP[^\n]*tc01/i);
  if (/\b(?:npm|pnpm|yarn)\s+(?:install|ci)\b/.test(workflow)) failures.push('WORKFLOW_CONTRACT: package installation is forbidden');
  return failures;
}

function eventFailures(contract, baseSha, candidateSha) {
  const failures = [];
  const eventName = process.env.GITHUB_EVENT_NAME;
  if (eventName === 'pull_request') {
    if (process.env.GITHUB_HEAD_REF !== contract.required_branch) {
      failures.push(`BASELINE_MISMATCH: PR head ref ${process.env.GITHUB_HEAD_REF || '<empty>'}`);
    }
    if (process.env.GITHUB_BASE_REF !== contract.required_pr_base_branch) {
      failures.push(`BASELINE_MISMATCH: PR base ref ${process.env.GITHUB_BASE_REF || '<empty>'}`);
    }
    if (process.env.PR_BASE_SHA !== contract.required_pr_base_sha) {
      failures.push(`BASELINE_MISMATCH: PR base SHA ${process.env.PR_BASE_SHA || '<empty>'}`);
    }
  } else if (eventName === 'push') {
    if (process.env.GITHUB_REF_NAME !== contract.required_branch) {
      failures.push(`BASELINE_MISMATCH: push ref ${process.env.GITHUB_REF_NAME || '<empty>'}`);
    }
  } else if (eventName) {
    failures.push(`UNSUPPORTED_EVENT: ${eventName}`);
  } else {
    const branch = run('git', ['branch', '--show-current']);
    if (branch.exit_code !== 0) {
      throw new Error(`cannot inspect local branch: ${branch.stderr.trim()}`);
    }
    if (branch.stdout.trim() !== contract.required_branch) {
      failures.push(`BASELINE_MISMATCH: local branch ${branch.stdout.trim() || '<detached>'}`);
    }
  }
  if (baseSha !== contract.required_base_sha) failures.push(`BASELINE_MISMATCH: base SHA ${baseSha}`);
  const head = resolveCommit('HEAD');
  if (head !== candidateSha) failures.push(`BASELINE_MISMATCH: HEAD ${head} != candidate ${candidateSha}`);
  return failures;
}

function evidencePathIsExternal(evidencePath) {
  const relative = path.relative(repositoryRoot, evidencePath);
  return relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative);
}

function main(argv) {
  if (argv.length !== 4) {
    console.error('TC-01 tooling bootstrap validation: CONFIG ERROR');
    console.error('usage: node scripts/validate-tooling-bootstrap.js <contract.json> <base-commit> <candidate-commit> <external-evidence.json>');
    return 2;
  }

  const evidencePath = path.resolve(argv[3]);
  if (!evidencePathIsExternal(evidencePath)) {
    console.error('TC-01 tooling bootstrap validation: CONFIG ERROR');
    console.error(`- evidence path must be outside the repository: ${evidencePath}`);
    return 2;
  }

  let contract;
  let contractFailures;
  let baseSha;
  let candidateSha;
  try {
    ({ contract, failures: contractFailures } = loadAndValidateContract(argv[0]));
    baseSha = resolveCommit(argv[1]);
    candidateSha = resolveCommit(argv[2]);
  } catch (error) {
    const code = error instanceof ContractConfigError ? 2 : 3;
    console.error(`TC-01 tooling bootstrap validation: ${code === 2 ? 'CONFIG ERROR' : 'BLOCKED'}`);
    console.error(`- ${error.message}`);
    return code;
  }

  const checks = [
    run(process.execPath, [path.join(__dirname, 'validate-task-contract.js'), path.resolve(argv[0])]),
    run(process.execPath, [path.join(__dirname, 'validate-changed-paths.js'), path.resolve(argv[0]), baseSha, candidateSha]),
    run(process.execPath, [path.join(__dirname, 'validate-smoke.js')]),
    run(process.execPath, [path.join(__dirname, 'test-tooling-bootstrap.js')]),
  ];
  const failures = [
    ...contractFailures.map((failure) => `CONTRACT: ${failure}`),
    ...workflowFailures(contract),
    ...eventFailures(contract, baseSha, candidateSha),
  ];
  for (const check of checks) {
    if (check.exit_code !== 0) failures.push(`COMMAND_FAILED(${check.exit_code}): ${check.command}`);
  }

  const contractBytes = fs.readFileSync(path.resolve(argv[0]));
  const evidence = {
    schema_version: 1,
    task_id: contract.task_id,
    architecture_sha256: contract.architecture.sha256,
    required_base_sha: contract.required_base_sha,
    base_sha: baseSha,
    candidate_sha: candidateSha,
    contract_sha256: crypto.createHash('sha256').update(contractBytes).digest('hex'),
    node_version: process.version,
    event: process.env.GITHUB_EVENT_NAME || 'local',
    auto_fix_allowed: false,
    result: failures.length === 0 ? 'PASS' : 'FAIL',
    failures,
    checks,
  };

  try {
    fs.mkdirSync(path.dirname(evidencePath), { recursive: true });
    fs.writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, { encoding: 'utf8', flag: 'w' });
  } catch (error) {
    console.error('TC-01 tooling bootstrap validation: BLOCKED');
    console.error(`- cannot write external evidence: ${error.message}`);
    return 3;
  }

  if (failures.length > 0) {
    console.error('TC-01 tooling bootstrap validation: FAIL');
    for (const failure of failures) console.error(`- ${failure}`);
    console.error(`evidence: ${evidencePath}`);
    return 1;
  }

  console.log('TC-01 tooling bootstrap validation: PASS');
  console.log(`base: ${baseSha}`);
  console.log(`candidate: ${candidateSha}`);
  console.log(`evidence: ${evidencePath}`);
  return 0;
}

if (require.main === module) {
  process.exitCode = main(process.argv.slice(2));
}
