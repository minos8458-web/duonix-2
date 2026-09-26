#!/usr/bin/env node
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { loadAndValidateContract, ContractConfigError } = require('./validate-task-contract');

const repositoryRoot = path.resolve(__dirname, '..');
const UNKNOWN = '미확인';

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

function resolveOptionalRef(revision) {
  const result = run('git', ['rev-parse', '--verify', `${revision}^{commit}`]);
  return result.exit_code === 0 ? result.stdout.trim() : UNKNOWN;
}

function classifyExit(exitCode) {
  if (exitCode === 0) return 'PASS';
  if (exitCode === 1) return 'FAIL';
  if (exitCode === 2) return 'CONFIG_ERROR';
  return 'BLOCKED';
}

function commandEvidence(name, result, classification = classifyExit(result.exit_code)) {
  return {
    name,
    command: result.command,
    exit_code: result.exit_code,
    classification,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

function sameArray(actual, expected) {
  return Array.isArray(actual)
    && actual.length === expected.length
    && actual.every((value, index) => value === expected[index]);
}

function yamlTriggerBlock(source, trigger) {
  const lines = source.split(/\r?\n/);
  const start = lines.findIndex((line) => line === `  ${trigger}:`);
  if (start === -1) return null;

  let end = start + 1;
  while (end < lines.length && (lines[end].trim() === '' || /^ {4,}\S/.test(lines[end]))) {
    end += 1;
  }
  return lines.slice(start, end);
}

function yamlList(block, key) {
  if (!block) return null;
  const start = block.findIndex((line) => line === `    ${key}:`);
  if (start === -1) return null;

  const values = [];
  for (let index = start + 1; index < block.length; index += 1) {
    const match = block[index].match(/^ {6}-\s+(.+?)\s*$/);
    if (!match) {
      if (block[index].trim() === '') continue;
      break;
    }
    values.push(match[1]);
  }
  return values;
}

function yamlJobEnvBlock(source) {
  const lines = source.split(/\r?\n/);
  const jobStart = lines.findIndex((line) => line === '  deterministic-validation:');
  if (jobStart === -1) return null;
  const envStart = lines.findIndex((line, index) => index > jobStart && line === '    env:');
  if (envStart === -1 || lines.slice(jobStart + 1, envStart).some((line) => /^  \S/.test(line))) return null;

  let end = envStart + 1;
  while (end < lines.length && (lines[end].trim() === '' || /^ {6,}\S/.test(lines[end]))) end += 1;
  return lines.slice(envStart + 1, end);
}

function yamlStepBlock(source, name) {
  const lines = source.split(/\r?\n/);
  const start = lines.findIndex((line) => line === `      - name: ${name}`);
  if (start === -1) return null;
  let end = start + 1;
  while (end < lines.length && !/^      - name: /.test(lines[end])) end += 1;
  return lines.slice(start, end).join('\n');
}

function workflowFailures(contract, workflowSource) {
  const workflowPath = path.join(repositoryRoot, contract.allowed_paths[0]);
  let workflow = workflowSource;
  if (workflow === undefined) {
    try {
      workflow = fs.readFileSync(workflowPath, 'utf8');
    } catch (error) {
      throw new Error(`cannot read workflow ${workflowPath}: ${error.message}`);
    }
  }
  const failures = [];
  const requirePattern = (label, pattern, source = workflow) => {
    if (!pattern.test(source)) failures.push(`WORKFLOW_CONTRACT: missing ${label}`);
  };
  const pullRequestBlock = yamlTriggerBlock(workflow, 'pull_request');
  const pullRequestTypes = yamlList(pullRequestBlock, 'types');
  const expectedPullRequestTypes = ['opened', 'synchronize', 'reopened', 'ready_for_review'];
  const jobEnv = yamlJobEnvBlock(workflow);
  const prepareEvidenceStep = yamlStepBlock(workflow, 'Prepare external evidence directory');
  const uploadEvidenceStep = yamlStepBlock(workflow, 'Upload TC-01 validation evidence');

  if (jobEnv?.some((line) => /^ {6}EVIDENCE_DIR\s*:/.test(line))) {
    failures.push('WORKFLOW_CONTRACT: jobs.deterministic-validation.env must not define EVIDENCE_DIR; runner.temp is unavailable at job level');
  }
  if (jobEnv?.some((line) => /\$\{\{\s*runner\./.test(line))) {
    failures.push('WORKFLOW_CONTRACT: runner context is forbidden in jobs.deterministic-validation.env');
  }
  if (!prepareEvidenceStep) failures.push('WORKFLOW_CONTRACT: missing Prepare external evidence directory step');
  if (!uploadEvidenceStep) failures.push('WORKFLOW_CONTRACT: missing Upload TC-01 validation evidence step');

  if (/pull_request_target\s*:/.test(workflow)) failures.push('WORKFLOW_CONTRACT: pull_request_target is forbidden');
  if (pullRequestBlock?.some((line) => /^ {4}paths(?:-ignore)?:/.test(line))) {
    failures.push('WORKFLOW_CONTRACT: pull_request paths filters are forbidden');
  }
  if (!sameArray(pullRequestTypes, expectedPullRequestTypes)) {
    failures.push(`WORKFLOW_CONTRACT: pull_request types must equal ${JSON.stringify(expectedPullRequestTypes)}`);
  }
  requirePattern('deterministic-validation job key', /jobs:\s*\n\s+deterministic-validation:/);
  requirePattern('deterministic-validation job name', /name:\s*deterministic-validation/);
  requirePattern('ten minute timeout', /timeout-minutes:\s*10/);
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
  requirePattern('immutable upload-artifact action', new RegExp(contract.workflow.upload_artifact.action.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  requirePattern('candidate-specific artifact name', /name:\s*tc-01-validation-evidence-\$\{\{\s*env\.CANDIDATE_SHA\s*\}\}/);
  requirePattern('artifact retention', /retention-days:\s*30/);
  for (const evidenceFile of contract.workflow.evidence_files) {
    requirePattern(
      `upload-artifact runner temp path for ${evidenceFile}`,
      new RegExp(`\\$\\{\\{\\s*runner\\.temp\\s*\\}\\}/tc01/${evidenceFile.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`),
      uploadEvidenceStep || '',
    );
  }
  requirePattern('runner temp evidence directory assignment', /evidence_dir="\$RUNNER_TEMP\/tc01"/, prepareEvidenceStep || '');
  requirePattern('external evidence directory creation', /mkdir -p "\$evidence_dir"/, prepareEvidenceStep || '');
  requirePattern('GITHUB_ENV evidence directory export', /echo "EVIDENCE_DIR=\$evidence_dir" >> "\$GITHUB_ENV"/, prepareEvidenceStep || '');
  requirePattern('changed-path evidence CLI', /validate-changed-paths\.js[^\n]*"\$EVIDENCE_DIR"/);
  requirePattern('self-test evidence CLI', /test-tooling-bootstrap\.js\s+"\$EVIDENCE_DIR"/);
  requirePattern('final clean worktree gate', /git status --porcelain/);
  if (/\b(?:npm|pnpm|yarn)\s+(?:install|ci)\b/.test(workflow)) failures.push('WORKFLOW_CONTRACT: package installation is forbidden');
  return failures;
}

function eventFailures(contract, baseSha, candidateSha) {
  const failures = [];
  const eventName = process.env.GITHUB_EVENT_NAME;
  if (process.env.GITHUB_REPOSITORY && process.env.GITHUB_REPOSITORY !== contract.repository) {
    failures.push(`REPOSITORY_MISMATCH: ${process.env.GITHUB_REPOSITORY} != ${contract.repository}`);
  }
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
  const nodeVersion = process.versions.node;
  const nodeMajor = Number.parseInt(nodeVersion.split('.')[0], 10);
  if (nodeMajor !== 24) {
    console.error('TC-01 tooling bootstrap validation: BLOCKED');
    console.error(`- RUNTIME_MISMATCH: Node 24.x required, received ${nodeVersion}`);
    return 3;
  }

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

  const evidenceDirectory = path.dirname(evidencePath);
  const diffCheck = run('git', ['diff', '--check', baseSha, candidateSha]);
  const ancestryCheck = run('git', ['merge-base', '--is-ancestor', baseSha, candidateSha]);
  const contractCheck = run(process.execPath, [
    path.join(__dirname, 'validate-task-contract.js'), path.resolve(argv[0]),
  ]);
  const changedPathsCheck = run(process.execPath, [
    path.join(__dirname, 'validate-changed-paths.js'),
    path.resolve(argv[0]),
    baseSha,
    candidateSha,
    evidenceDirectory,
  ]);
  const smokeCheck = run(process.execPath, [path.join(__dirname, 'validate-smoke.js')]);
  const selfTestCheck = run(process.execPath, [
    path.join(__dirname, 'test-tooling-bootstrap.js'), evidenceDirectory,
  ]);
  const worktreeCheck = run('git', ['status', '--porcelain']);
  const worktreeCleanAfter = worktreeCheck.exit_code === 0 && worktreeCheck.stdout.trim() === '';
  const commands = [
    commandEvidence('git-diff-check', diffCheck),
    commandEvidence('ancestry-check', ancestryCheck),
    commandEvidence('validate-task-contract', contractCheck),
    commandEvidence('validate-changed-paths', changedPathsCheck),
    commandEvidence('validate-smoke', smokeCheck),
    commandEvidence('test-tooling-bootstrap', selfTestCheck),
    commandEvidence('worktree-clean-after', worktreeCheck, worktreeCleanAfter ? 'PASS' : 'FAIL'),
  ];
  const failures = [
    ...contractFailures.map((failure) => `CONTRACT: ${failure}`),
    ...workflowFailures(contract),
    ...eventFailures(contract, baseSha, candidateSha),
  ];
  if (ancestryCheck.exit_code === 1) {
    failures.push(`BASELINE_MISMATCH: ${baseSha} is not an ancestor of ${candidateSha}`);
  } else if (ancestryCheck.exit_code !== 0) {
    failures.push(`ANCESTRY_CHECK_BLOCKED(${ancestryCheck.exit_code}): ${ancestryCheck.stderr.trim()}`);
  }
  for (const command of commands) {
    if (command.classification !== 'PASS') {
      failures.push(`COMMAND_${command.classification}(${command.exit_code}): ${command.command}`);
    }
  }

  const evidenceFiles = {
    changed_paths: path.join(evidenceDirectory, 'changed-paths.txt'),
    changed_modes: path.join(evidenceDirectory, 'changed-modes-raw.txt'),
    self_test: path.join(evidenceDirectory, 'self-test-evidence.json'),
  };
  for (const [label, requiredPath] of Object.entries(evidenceFiles)) {
    if (!fs.existsSync(requiredPath)) failures.push(`MISSING_EVIDENCE_FILE: ${label} ${requiredPath}`);
  }

  const readEvidenceLines = (evidenceFile) => (
    fs.existsSync(evidenceFile)
      ? fs.readFileSync(evidenceFile, 'utf8').split(/\r?\n/).filter(Boolean)
      : []
  );
  const localBranch = run('git', ['branch', '--show-current']).stdout.trim();
  const eventName = process.env.GITHUB_EVENT_NAME || 'local';
  const resolvedBaseBranchSha = process.env.RESOLVED_BASE_BRANCH_SHA
    || resolveOptionalRef(`refs/remotes/origin/${contract.required_pr_base_branch}`);
  const hasBlockedCommand = commands.some((command) => command.classification === 'BLOCKED');
  const finalResult = failures.length === 0 ? 'PASS' : (hasBlockedCommand ? 'BLOCKED' : 'FAIL');

  const contractBytes = fs.readFileSync(path.resolve(argv[0]));
  const evidence = {
    schema_version: 1,
    task_id: contract.task_id,
    repository: contract.repository,
    architecture_sha256: contract.architecture.sha256,
    required_base_sha: contract.required_base_sha,
    required_branch: contract.required_branch,
    required_pr_base_branch: contract.required_pr_base_branch,
    required_pr_base_sha: contract.required_pr_base_sha,
    candidate_sha: candidateSha,
    event_name: eventName,
    event_ref: process.env.GITHUB_REF || (localBranch ? `refs/heads/${localBranch}` : UNKNOWN),
    head_ref: process.env.GITHUB_HEAD_REF || UNKNOWN,
    base_ref: process.env.GITHUB_BASE_REF || UNKNOWN,
    event_pr_base_sha: process.env.PR_BASE_SHA || UNKNOWN,
    resolved_base_branch_sha: resolvedBaseBranchSha,
    runner_os: process.env.RUNNER_OS || process.platform,
    runner_arch: process.env.RUNNER_ARCH || process.arch,
    contract_sha256: crypto.createHash('sha256').update(contractBytes).digest('hex'),
    node_version: process.version,
    workflow_run_id: process.env.GITHUB_RUN_ID || UNKNOWN,
    workflow_run_attempt: process.env.GITHUB_RUN_ATTEMPT || UNKNOWN,
    contract_path: path.relative(repositoryRoot, path.resolve(argv[0])).split(path.sep).join('/'),
    checkout_fetch_depth: contract.workflow.checkout.fetch_depth,
    checkout_persist_credentials: contract.workflow.checkout.persist_credentials,
    changed_paths: readEvidenceLines(evidenceFiles.changed_paths),
    changed_modes: readEvidenceLines(evidenceFiles.changed_modes),
    commands,
    smoke_result: classifyExit(smokeCheck.exit_code),
    scope_result: classifyExit(changedPathsCheck.exit_code),
    mode_type_result: classifyExit(changedPathsCheck.exit_code),
    self_test_result: classifyExit(selfTestCheck.exit_code),
    evidence_directory: evidenceDirectory,
    evidence_outside_worktree: evidencePathIsExternal(evidencePath),
    worktree_clean_after: worktreeCleanAfter,
    auto_fix_allowed: false,
    final_result: finalResult,
    failures,
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
    console.error(`TC-01 tooling bootstrap validation: ${finalResult}`);
    for (const failure of failures) console.error(`- ${failure}`);
    console.error(`evidence: ${evidencePath}`);
    return finalResult === 'BLOCKED' ? 3 : 1;
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

module.exports = { workflowFailures };
