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

function main(argv) {
  if (argv.length !== 0) {
    console.error('TC-01 tooling bootstrap self-test: CONFIG ERROR');
    console.error('usage: node scripts/test-tooling-bootstrap.js');
    return 2;
  }

  let fixtureRoot;
  try {
    fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'duonix-tc01-'));
    const scopeRepo = path.join(fixtureRoot, 'scope-negative');
    fs.mkdirSync(scopeRepo);
    requireGit(run('git', ['init', '--quiet'], scopeRepo), 'scope fixture git init');
    requireGit(run('git', ['-c', 'user.name=TC-01 Self Test', '-c', 'user.email=tc01@example.invalid', 'commit', '--allow-empty', '--quiet', '-m', 'fixture base'], scopeRepo), 'scope fixture base commit');
    const baseSha = run('git', ['rev-parse', 'HEAD'], scopeRepo);
    requireGit(baseSha, 'scope fixture base SHA');
    fs.writeFileSync(path.join(scopeRepo, 'duonix.html'), '<!doctype html><title>out of scope</title>\n');
    requireGit(run('git', ['add', '--', 'duonix.html'], scopeRepo), 'scope fixture add');
    requireGit(run('git', ['-c', 'user.name=TC-01 Self Test', '-c', 'user.email=tc01@example.invalid', 'commit', '--quiet', '-m', 'out of scope fixture'], scopeRepo), 'scope fixture candidate commit');
    const candidateSha = run('git', ['rev-parse', 'HEAD'], scopeRepo);
    requireGit(candidateSha, 'scope fixture candidate SHA');

    const scopeResult = run(process.execPath, [changedPathValidator, contractPath, baseSha.stdout.trim(), candidateSha.stdout.trim()], scopeRepo);
    const scopeDiagnostic = `${scopeResult.stdout}\n${scopeResult.stderr}`;
    console.log('INTENDED_FAIL_SCOPE_BEGIN');
    console.log(`internal_exit_code=${scopeResult.status}`);
    process.stdout.write(scopeDiagnostic);
    console.log('INTENDED_FAIL_SCOPE_END');
    if (scopeResult.status !== 1 || !/OUT_OF_SCOPE_PATH:\s*duonix\.html/.test(scopeDiagnostic)) {
      console.error('TC-01 tooling bootstrap self-test: FAIL');
      console.error('- scope negative case did not produce exit 1 with out-of-scope diagnostic');
      return 1;
    }

    const smokeRepo = path.join(fixtureRoot, 'smoke-negative');
    fs.mkdirSync(smokeRepo);
    fs.writeFileSync(path.join(smokeRepo, 'duonix.html'), '<!doctype html><img src="missing-local.png">\n');
    const smokeResult = run(process.execPath, [smokeValidator, smokeRepo], repositoryRoot);
    const smokeDiagnostic = `${smokeResult.stdout}\n${smokeResult.stderr}`;
    console.log('INTENDED_FAIL_SMOKE_BEGIN');
    console.log(`internal_exit_code=${smokeResult.status}`);
    process.stdout.write(smokeDiagnostic);
    console.log('INTENDED_FAIL_SMOKE_END');
    if (smokeResult.status !== 1 || !/missing\s+missing-local\.png/i.test(smokeDiagnostic)) {
      console.error('TC-01 tooling bootstrap self-test: FAIL');
      console.error('- smoke negative case did not produce exit 1 with missing-reference diagnostic');
      return 1;
    }

    console.log('TC-01 tooling bootstrap self-test: PASS');
    console.log('intended failures observed: scope=1, smoke=1');
    return 0;
  } catch (error) {
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
