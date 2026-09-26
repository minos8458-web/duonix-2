#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const repositoryRoot = path.resolve(__dirname, '..');
const contractPath = path.join(repositoryRoot, 'automation', 'contracts', 'tc-01-tooling-bootstrap.json');
const changedPathValidator = path.join(__dirname, 'validate-changed-paths.js');
const smokeValidator = path.join(__dirname, 'validate-smoke.js');

function run(command, args, cwd) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  });
  if (result.error) {
    throw new Error(`cannot execute ${command}: ${result.error.message}`);
  }
  return { status: result.status, stdout: result.stdout || '', stderr: result.stderr || '' };
}

function requireGit(result, label) {
  if (result.status !== 0) {
    throw new Error(`${label} failed: ${result.stderr.trim()}`);
  }
}

function evidenceDirectoryIsExternal(evidenceDirectory) {
  const relative = path.relative(repositoryRoot, evidenceDirectory);
  return relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative);
}

function writeEvidence(evidenceDirectory, evidence) {
  fs.mkdirSync(evidenceDirectory, { recursive: true });
  fs.writeFileSync(
    path.join(evidenceDirectory, 'self-test-evidence.json'),
    `${JSON.stringify(evidence, null, 2)}\n`,
    'utf8',
  );
}

function main(argv) {
  if (argv.length !== 1) {
    console.error('TC-01 tooling bootstrap self-test: CONFIG ERROR');
    console.error('usage: node scripts/test-tooling-bootstrap.js <external-evidence-directory>');
    return 2;
  }

  const evidenceDirectory = path.resolve(argv[0]);
  if (!evidenceDirectoryIsExternal(evidenceDirectory)) {
    console.error('TC-01 tooling bootstrap self-test: CONFIG ERROR');
    console.error(`- evidence directory must be outside the repository: ${evidenceDirectory}`);
    return 2;
  }

  let fixtureRoot;
  const evidence = {
    schema_version: 1,
    task_id: 'TC-01',
    evidence_directory: evidenceDirectory,
    scope_negative: null,
    smoke_negative: null,
    final_result: 'BLOCKED',
  };
  try {
    fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'duonix-tc01-'));
    const scopeRepo = path.join(fixtureRoot, 'scope-negative');
    const scopeEvidenceDirectory = path.join(fixtureRoot, 'scope-evidence');
    requireGit(run('git', ['clone', '--quiet', '--no-checkout', repositoryRoot, scopeRepo], fixtureRoot), 'scope fixture local clone');
    requireGit(run('git', ['switch', '--detach', '8a08658222e19a5cb542f6d7975505c88ae72369'], scopeRepo), 'scope fixture exact base checkout');
    const baseSha = run('git', ['rev-parse', 'HEAD'], scopeRepo);
    requireGit(baseSha, 'scope fixture base SHA');
    fs.appendFileSync(path.join(scopeRepo, 'duonix.html'), '\n<!-- TC-01 disposable out-of-scope fixture -->\n');
    requireGit(run('git', ['add', '--', 'duonix.html'], scopeRepo), 'scope fixture add');
    requireGit(run('git', ['-c', 'user.name=TC-01 Self Test', '-c', 'user.email=tc01@example.invalid', 'commit', '--quiet', '-m', 'out of scope fixture'], scopeRepo), 'scope fixture candidate commit');
    const candidateSha = run('git', ['rev-parse', 'HEAD'], scopeRepo);
    requireGit(candidateSha, 'scope fixture candidate SHA');

    const scopeResult = run(
      process.execPath,
      [changedPathValidator, contractPath, baseSha.stdout.trim(), candidateSha.stdout.trim(), scopeEvidenceDirectory],
      scopeRepo,
    );
    const scopeDiagnostic = `${scopeResult.stdout}\n${scopeResult.stderr}`;
    evidence.scope_negative = {
      expected_exit_code: 1,
      actual_exit_code: scopeResult.status,
      required_diagnostic: 'OUT_OF_SCOPE_PATH: duonix.html',
      diagnostic: scopeDiagnostic.trim(),
      result: scopeResult.status === 1 && /OUT_OF_SCOPE_PATH:\s*duonix\.html/.test(scopeDiagnostic) ? 'PASS' : 'FAIL',
    };
    console.log('INTENDED_FAIL_SCOPE_BEGIN');
    console.log(`internal_exit_code=${scopeResult.status}`);
    process.stdout.write(scopeDiagnostic);
    console.log('INTENDED_FAIL_SCOPE_END');
    if (scopeResult.status !== 1 || !/OUT_OF_SCOPE_PATH:\s*duonix\.html/.test(scopeDiagnostic)) {
      evidence.final_result = 'FAIL';
      writeEvidence(evidenceDirectory, evidence);
      console.error('TC-01 tooling bootstrap self-test: FAIL');
      console.error('- scope negative case did not produce exit 1 with out-of-scope diagnostic');
      return 1;
    }

    const smokeRepo = path.join(fixtureRoot, 'smoke-negative');
    fs.mkdirSync(smokeRepo);
    fs.writeFileSync(path.join(smokeRepo, 'duonix.html'), '<!doctype html><img src="missing-local.png">\n');
    const smokeResult = run(process.execPath, [smokeValidator, smokeRepo], repositoryRoot);
    const smokeDiagnostic = `${smokeResult.stdout}\n${smokeResult.stderr}`;
    evidence.smoke_negative = {
      expected_exit_code: 1,
      actual_exit_code: smokeResult.status,
      required_diagnostic: 'missing missing-local.png',
      diagnostic: smokeDiagnostic.trim(),
      result: smokeResult.status === 1 && /missing\s+missing-local\.png/i.test(smokeDiagnostic) ? 'PASS' : 'FAIL',
    };
    console.log('INTENDED_FAIL_SMOKE_BEGIN');
    console.log(`internal_exit_code=${smokeResult.status}`);
    process.stdout.write(smokeDiagnostic);
    console.log('INTENDED_FAIL_SMOKE_END');
    if (smokeResult.status !== 1 || !/missing\s+missing-local\.png/i.test(smokeDiagnostic)) {
      evidence.final_result = 'FAIL';
      writeEvidence(evidenceDirectory, evidence);
      console.error('TC-01 tooling bootstrap self-test: FAIL');
      console.error('- smoke negative case did not produce exit 1 with missing-reference diagnostic');
      return 1;
    }

    evidence.final_result = 'PASS';
    writeEvidence(evidenceDirectory, evidence);
    console.log('TC-01 tooling bootstrap self-test: PASS');
    console.log('intended failures observed: scope=1, smoke=1');
    console.log(`evidence: ${path.join(evidenceDirectory, 'self-test-evidence.json')}`);
    return 0;
  } catch (error) {
    evidence.final_result = 'BLOCKED';
    evidence.error = error.message;
    try {
      writeEvidence(evidenceDirectory, evidence);
    } catch (evidenceError) {
      console.error(`TC-01 tooling bootstrap self-test evidence warning: ${evidenceError.message}`);
    }
    console.error('TC-01 tooling bootstrap self-test: BLOCKED');
    console.error(`- ${error.message}`);
    return 3;
  } finally {
    if (fixtureRoot) {
      try {
        fs.rmSync(fixtureRoot, { recursive: true, force: true });
      } catch (error) {
        console.error(`TC-01 tooling bootstrap self-test cleanup warning: ${error.message}`);
      }
    }
  }
}

process.exitCode = main(process.argv.slice(2));
