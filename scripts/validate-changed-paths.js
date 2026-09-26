#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { loadAndValidateContract, ContractConfigError } = require('./validate-task-contract');

function runGit(args) {
  const result = spawnSync('git', args, {
    cwd: process.cwd(),
    encoding: null,
    maxBuffer: 16 * 1024 * 1024,
  });
  if (result.error) {
    throw new Error(`cannot execute git: ${result.error.message}`);
  }
  return {
    status: result.status,
    stdout: result.stdout || Buffer.alloc(0),
    stderr: result.stderr || Buffer.alloc(0),
  };
}

function bufferText(buffer) {
  return buffer.toString('utf8').trim();
}

function verifyCommit(revision, label) {
  const result = runGit(['rev-parse', '--verify', `${revision}^{commit}`]);
  if (result.status !== 0) {
    throw new Error(`${label} is not an available commit: ${bufferText(result.stderr) || revision}`);
  }
  return bufferText(result.stdout);
}

function verifyAncestry(baseRevision, candidateRevision) {
  const result = runGit(['merge-base', '--is-ancestor', baseRevision, candidateRevision]);
  if (result.status === 0) return true;
  if (result.status === 1) return false;
  throw new Error(`git merge-base --is-ancestor failed: ${bufferText(result.stderr)}`);
}

function resolveWorktreeRoot() {
  const result = runGit(['rev-parse', '--show-toplevel']);
  if (result.status !== 0) {
    throw new Error(`cannot resolve repository worktree: ${bufferText(result.stderr)}`);
  }
  return path.resolve(bufferText(result.stdout));
}

function isOutsideDirectory(parent, target) {
  const relative = path.relative(parent, target);
  return relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative);
}

function splitNul(buffer) {
  const values = buffer.toString('utf8').split('\0');
  if (values.at(-1) === '') {
    values.pop();
  }
  return values;
}

function parseNameStatus(buffer) {
  const tokens = splitNul(buffer);
  const records = [];
  let index = 0;

  while (index < tokens.length) {
    let statusToken = tokens[index++];
    let firstPath;
    if (statusToken.includes('\t')) {
      const tabIndex = statusToken.indexOf('\t');
      firstPath = statusToken.slice(tabIndex + 1);
      statusToken = statusToken.slice(0, tabIndex);
    } else {
      firstPath = tokens[index++];
    }
    if (!statusToken || firstPath === undefined) {
      throw new Error('malformed NUL-delimited --name-status output');
    }

    const status = statusToken[0];
    const record = { status, statusToken, path: firstPath };
    if (status === 'R' || status === 'C') {
      record.oldPath = firstPath;
      record.path = tokens[index++];
      if (record.path === undefined) {
        throw new Error('malformed rename/copy record');
      }
    }
    records.push(record);
  }
  return records;
}

function parseRaw(buffer) {
  const tokens = splitNul(buffer);
  const records = [];
  let index = 0;

  while (index < tokens.length) {
    let header = tokens[index++];
    let firstPath;
    if (header.includes('\t')) {
      const tabIndex = header.indexOf('\t');
      firstPath = header.slice(tabIndex + 1);
      header = header.slice(0, tabIndex);
    } else {
      firstPath = tokens[index++];
    }
    const match = /^:(\d{6}) (\d{6}) ([0-9a-f]+) ([0-9a-f]+) ([A-Z])(\d*)$/.exec(header);
    if (!match || firstPath === undefined) {
      throw new Error(`malformed NUL-delimited --raw output near ${JSON.stringify(header)}`);
    }
    const record = {
      oldMode: match[1],
      newMode: match[2],
      oldObject: match[3],
      newObject: match[4],
      status: match[5],
      score: match[6],
      path: firstPath,
    };
    if (record.status === 'R' || record.status === 'C') {
      record.oldPath = firstPath;
      record.path = tokens[index++];
      if (record.path === undefined) {
        throw new Error('malformed raw rename/copy record');
      }
    }
    records.push(record);
  }
  return records;
}

function validateChangedPaths(contract, baseRevision, candidateRevision) {
  const failures = [];
  const nameStatusResult = runGit([
    'diff', '--name-status', '-z', '--find-renames', '--find-copies', baseRevision, candidateRevision, '--',
  ]);
  if (nameStatusResult.status !== 0) {
    throw new Error(`git diff --name-status failed: ${bufferText(nameStatusResult.stderr)}`);
  }
  const rawResult = runGit([
    'diff', '--raw', '-z', '--no-abbrev', '--find-renames', '--find-copies', baseRevision, candidateRevision, '--',
  ]);
  if (rawResult.status !== 0) {
    throw new Error(`git diff --raw failed: ${bufferText(rawResult.stderr)}`);
  }

  const nameRecords = parseNameStatus(nameStatusResult.stdout);
  const rawRecords = parseRaw(rawResult.stdout);
  const allowed = new Set(contract.allowed_paths);
  const seen = new Set();

  for (const record of nameRecords) {
    if (record.status !== 'A') {
      failures.push(`NON_ADDITIVE_STATUS: ${record.statusToken} ${record.oldPath ? `${record.oldPath} -> ` : ''}${record.path}`);
    }
    if (!allowed.has(record.path)) {
      failures.push(`OUT_OF_SCOPE_PATH: ${record.path}`);
    }
    if (seen.has(record.path)) {
      failures.push(`DUPLICATE_CHANGED_PATH: ${record.path}`);
    }
    seen.add(record.path);
  }

  for (const expectedPath of contract.allowed_paths) {
    if (!seen.has(expectedPath)) {
      failures.push(`MISSING_REQUIRED_PATH: ${expectedPath}`);
    }
  }
  if (nameRecords.length !== contract.allowed_paths.length) {
    failures.push(`CHANGED_PATH_COUNT: expected ${contract.allowed_paths.length}, received ${nameRecords.length}`);
  }

  const rawByPath = new Map();
  for (const record of rawRecords) {
    rawByPath.set(record.path, record);
    if (record.status !== 'A') {
      failures.push(`RAW_NON_ADDITIVE_STATUS: ${record.status} ${record.path}`);
    }
    if (record.newMode === '120000') {
      failures.push(`SYMLINK_REJECTED: ${record.path}`);
    } else if (record.newMode === '160000') {
      failures.push(`GITLINK_REJECTED: ${record.path}`);
    } else if (record.newMode !== '100644') {
      failures.push(`INVALID_MODE: ${record.path} expected 100644, received ${record.newMode}`);
    }
    if (record.oldMode !== '000000') {
      failures.push(`NOT_NEW_FILE: ${record.path} old mode ${record.oldMode}`);
    }
  }

  for (const expectedPath of contract.allowed_paths) {
    const rawRecord = rawByPath.get(expectedPath);
    if (!rawRecord) {
      failures.push(`MISSING_RAW_RECORD: ${expectedPath}`);
      continue;
    }
    const typeResult = runGit(['cat-file', '-t', `${candidateRevision}:${expectedPath}`]);
    if (typeResult.status !== 0) {
      failures.push(`OBJECT_LOOKUP_FAILED: ${expectedPath}: ${bufferText(typeResult.stderr)}`);
    } else if (bufferText(typeResult.stdout) !== 'blob') {
      failures.push(`INVALID_OBJECT_TYPE: ${expectedPath} expected blob, received ${bufferText(typeResult.stdout)}`);
    }
  }

  return { failures, nameRecords, rawRecords };
}

function writeEvidence(evidenceDirectory, result) {
  fs.mkdirSync(evidenceDirectory, { recursive: true });
  const changedPaths = result.nameRecords.map((record) => {
    if (record.oldPath) {
      return `${record.statusToken}\t${JSON.stringify(record.oldPath)}\t${JSON.stringify(record.path)}`;
    }
    return `${record.statusToken}\t${JSON.stringify(record.path)}`;
  });
  const changedModes = result.rawRecords.map((record) => {
    const header = `:${record.oldMode} ${record.newMode} ${record.oldObject} ${record.newObject} ${record.status}${record.score}`;
    if (record.oldPath) {
      return `${header}\t${JSON.stringify(record.oldPath)}\t${JSON.stringify(record.path)}`;
    }
    return `${header}\t${JSON.stringify(record.path)}`;
  });
  fs.writeFileSync(path.join(evidenceDirectory, 'changed-paths.txt'), `${changedPaths.join('\n')}\n`, 'utf8');
  fs.writeFileSync(path.join(evidenceDirectory, 'changed-modes-raw.txt'), `${changedModes.join('\n')}\n`, 'utf8');
}

function main(argv) {
  if (argv.length !== 4) {
    console.error('TC-01 changed-path validation: CONFIG ERROR');
    console.error('usage: node scripts/validate-changed-paths.js <contract.json> <base-commit> <candidate-commit> <external-evidence-directory>');
    return 2;
  }

  try {
    const { contract, failures: contractFailures } = loadAndValidateContract(argv[0]);
    if (contractFailures.length > 0) {
      console.error('TC-01 changed-path validation: FAIL');
      for (const failure of contractFailures) console.error(`- CONTRACT: ${failure}`);
      return 1;
    }
    const baseSha = verifyCommit(argv[1], 'base revision');
    const candidateSha = verifyCommit(argv[2], 'candidate revision');
    const worktreeRoot = resolveWorktreeRoot();
    const evidenceDirectory = path.resolve(argv[3]);
    if (!isOutsideDirectory(worktreeRoot, evidenceDirectory)) {
      console.error(`TC-01 changed-path validation: CONFIG ERROR\n- evidence directory must be outside the repository: ${evidenceDirectory}`);
      return 2;
    }
    if (baseSha !== contract.required_base_sha) {
      console.error(`TC-01 changed-path validation: FAIL\n- BASELINE_MISMATCH: expected ${contract.required_base_sha}, received ${baseSha}`);
      return 1;
    }
    if (!verifyAncestry(baseSha, candidateSha)) {
      console.error(`TC-01 changed-path validation: FAIL\n- BASELINE_MISMATCH: ${baseSha} is not an ancestor of ${candidateSha}`);
      return 1;
    }

    const result = validateChangedPaths(contract, baseSha, candidateSha);
    try {
      writeEvidence(evidenceDirectory, result);
    } catch (error) {
      console.error(`TC-01 changed-path validation: BLOCKED\n- cannot write external evidence: ${error.message}`);
      return 3;
    }
    if (result.failures.length > 0) {
      console.error('TC-01 changed-path validation: FAIL');
      for (const failure of result.failures) console.error(`- ${failure}`);
      return 1;
    }

    console.log('TC-01 changed-path validation: PASS');
    console.log(`base: ${baseSha}`);
    console.log(`candidate: ${candidateSha}`);
    console.log(`exact additive paths: ${result.nameRecords.length}`);
    console.log('mode/type: 100644 blob');
    console.log(`evidence directory: ${evidenceDirectory}`);
    return 0;
  } catch (error) {
    if (error instanceof ContractConfigError) {
      console.error(`TC-01 changed-path validation: CONFIG ERROR\n- ${error.message}`);
      return 2;
    }
    console.error(`TC-01 changed-path validation: BLOCKED\n- ${error.message}`);
    return 3;
  }
}

if (require.main === module) {
  process.exitCode = main(process.argv.slice(2));
}

module.exports = { parseNameStatus, parseRaw, validateChangedPaths, verifyAncestry, writeEvidence };
