#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const repositoryRoot = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const entryName = 'duonix.html';
const entryPath = path.join(repositoryRoot, entryName);
const failures = [];
const references = new Map();

function addReference(rawValue, source) {
  const value = rawValue.trim();
  if (!value || value.startsWith('#') || value.includes('${') || value.includes('{{')) {
    return;
  }
  if ((source === 'static file literal' || source === 'CSS url()') && /^(?:application|audio|font|image|text|video)\/[a-z0-9.+-]+$/i.test(value)) {
    return;
  }

  let localPath;
  let referenceKind;

  try {
    if (/^https?:\/\//i.test(value)) {
      const url = new URL(value);
      if (url.hostname.toLowerCase() !== 'raw.githubusercontent.com') {
        return;
      }

      const pathParts = decodeURIComponent(url.pathname.replace(/^\/+/, '')).split('/');
      if (pathParts.length < 4) {
        return;
      }

      localPath = pathParts.slice(3).join('/');
      referenceKind = 'repository raw URL';
    } else if (/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(value)) {
      return;
    } else {
      const withoutQuery = value.split(/[?#]/, 1)[0];
      if (!withoutQuery) {
        return;
      }

      localPath = decodeURIComponent(withoutQuery);
      if (localPath.startsWith('/')) {
        localPath = localPath.slice(1);
      }
      referenceKind = 'local path';
    }
  } catch (error) {
    failures.push(`${source}: invalid reference ${JSON.stringify(value)} (${error.message})`);
    return;
  }

  const absolutePath = path.resolve(repositoryRoot, localPath);
  const relativePath = path.relative(repositoryRoot, absolutePath);
  if (relativePath === '..' || relativePath.startsWith(`..${path.sep}`) || path.isAbsolute(relativePath)) {
    failures.push(`${source}: reference escapes the repository ${JSON.stringify(value)}`);
    return;
  }

  if (!references.has(absolutePath)) {
    references.set(absolutePath, { relativePath, sources: [] });
  }
  references.get(absolutePath).sources.push(`${source} (${referenceKind})`);
}

function collectReferences(html) {
  const attributePattern = /\b(?:src|href|poster|data-src|data-href)\s*=\s*(['"])([\s\S]*?)\1/gi;
  for (const match of html.matchAll(attributePattern)) {
    addReference(match[2], 'HTML attribute');
  }

  const srcsetPattern = /\bsrcset\s*=\s*(['"])([\s\S]*?)\1/gi;
  for (const match of html.matchAll(srcsetPattern)) {
    for (const candidate of match[2].split(',')) {
      const candidatePath = candidate.trim().split(/\s+/, 1)[0];
      addReference(candidatePath, 'HTML srcset');
    }
  }

  const cssUrlPattern = /url\(\s*(?:"([^"]*)"|'([^']*)'|([^)]*?))\s*\)/gi;
  for (const match of html.matchAll(cssUrlPattern)) {
    addReference(match[1] || match[2] || match[3], 'CSS url()');
  }

  const rawRepositoryUrlPattern = /https?:\/\/raw\.githubusercontent\.com\/[^\s'"`,;)<>]+/gi;
  for (const match of html.matchAll(rawRepositoryUrlPattern)) {
    addReference(match[0], 'repository raw URL literal');
  }

  const staticFilePattern = /(['"`])((?:\.{0,2}\/|\/)?[A-Za-z0-9][A-Za-z0-9._()/% \-]*\.(?:png|jpe?g|gif|svg|webp|wav|mp3|ogg|mp4|css|js|json|woff2?|ttf)(?:[?#][^'"`]*)?)\1/gi;
  for (const match of html.matchAll(staticFilePattern)) {
    addReference(match[2], 'static file literal');
  }
}

if (!fs.existsSync(entryPath)) {
  failures.push(`${entryName} is missing`);
} else {
  const entryStats = fs.statSync(entryPath);
  if (!entryStats.isFile()) {
    failures.push(`${entryName} is not a regular file`);
  } else if (entryStats.size === 0) {
    failures.push(`${entryName} is empty`);
  } else {
    collectReferences(fs.readFileSync(entryPath, 'utf8'));
  }
}

for (const [absolutePath, reference] of references) {
  if (!fs.existsSync(absolutePath)) {
    failures.push(`${reference.sources.join(', ')}: missing ${reference.relativePath}`);
    continue;
  }

  if (!fs.statSync(absolutePath).isFile()) {
    failures.push(`${reference.sources.join(', ')}: not a regular file ${reference.relativePath}`);
  }
}

if (failures.length > 0) {
  console.error('AUTO-001 smoke validation: FAIL');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exitCode = 1;
} else {
  console.log('AUTO-001 smoke validation: PASS');
  console.log(`${entryName}: present and non-empty`);
  console.log(`local static references checked: ${references.size}`);
}
