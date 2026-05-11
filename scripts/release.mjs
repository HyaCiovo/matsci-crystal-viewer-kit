import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const cwd = process.cwd();
const packageJsonPath = path.join(cwd, 'package.json');
const changelogPath = path.join(cwd, 'CHANGELOG.md');
const pkg = readJson(packageJsonPath);

const [, , command = 'help', ...restArgs] = process.argv;
const { positional, options } = parseArgs(restArgs);

const versionTarget = positional[0];
const preid = options.preid ?? 'rc';

main();

function main() {
  switch (command) {
    case 'prepare':
      ensureVersionTarget(versionTarget);
      prepareRelease({ versionTarget, preid, options });
      return;
    case 'publish':
      publishRelease(options);
      return;
    case 'release':
      ensureVersionTarget(versionTarget);
      prepareRelease({ versionTarget, preid, options });
      publishRelease(options);
      return;
    case 'changelog':
      ensureVersionTarget(versionTarget);
      writeChangelog({
        currentVersion: pkg.version,
        nextVersion: resolveNextVersion(pkg.version, versionTarget, preid),
        options,
      });
      return;
    case 'help':
    default:
      printHelp();
  }
}

function prepareRelease({ versionTarget, preid, options }) {
  ensureCleanWorktree(options);
  const currentVersion = pkg.version;
  const nextVersion = resolveNextVersion(pkg.version, versionTarget, preid);

  if (nextVersion === currentVersion) {
    throw new Error(`Next version must differ from current version ${currentVersion}.`);
  }

  if (!options.dryRun) {
    pkg.version = nextVersion;
    writeJson(packageJsonPath, pkg);
  }

  writeChangelog({ currentVersion, nextVersion, options });

  printSummary('Prepared release', {
    packageName: pkg.name,
    currentVersion,
    nextVersion,
    dryRun: options.dryRun,
  });
}

function publishRelease(options) {
  ensureCleanWorktree(options);

  if (!options.skipChecks) {
    runPackageManagerScript('typecheck');
    runPackageManagerScript('test');
    runPackageManagerScript('build');
  }

  const publishArgs = ['publish'];
  publishArgs.push('--cache', './.npm-cache');
  if (options.tag) {
    publishArgs.push('--tag', options.tag);
  }
  if (options.dryRun) {
    publishArgs.push('--dry-run');
  }

  runCommand('npm', publishArgs);
}

function writeChangelog({ currentVersion, nextVersion, options }) {
  const notes = collectReleaseNotes({ currentVersion, nextVersion, options });
  const entry = renderChangelogEntry({
    packageName: pkg.name,
    version: nextVersion,
    notes,
    date: formatDate(new Date()),
  });

  const existing = fs.existsSync(changelogPath)
    ? fs.readFileSync(changelogPath, 'utf8')
    : '# Changelog\n\nAll notable changes to this package will be documented in this file.\n';

  const updated = upsertChangelogEntry(existing, entry, nextVersion);
  if (!options.dryRun) {
    fs.writeFileSync(changelogPath, updated);
  }
}

function collectReleaseNotes({ currentVersion, nextVersion, options }) {
  const manualNotes = getManualNotes(options);
  if (manualNotes.length > 0) {
    return manualNotes;
  }

  const gitNotes = getGitCommitSubjects();
  if (gitNotes.length > 0) {
    return gitNotes;
  }

  return [`Release ${pkg.name} ${nextVersion} (from ${currentVersion}).`];
}

function getManualNotes(options) {
  const notes = [];

  if (options.notes) {
    notes.push(...splitNotes(options.notes));
  }

  if (options.notesFile) {
    const notesFilePath = path.resolve(cwd, options.notesFile);
    const fileContents = fs.readFileSync(notesFilePath, 'utf8');
    notes.push(...splitNotes(fileContents));
  }

  return dedupe(notes);
}

function getGitCommitSubjects() {
  if (!isInsideGitRepo()) {
    return [];
  }

  const lastTag = tryRunCommand('git', ['describe', '--tags', '--abbrev=0', '--match', 'v*']);
  const range = lastTag ? `${lastTag}..HEAD` : 'HEAD';
  const output = tryRunCommand('git', ['log', range, '--pretty=format:%s']);
  if (!output) {
    return [];
  }

  return dedupe(
    output
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .filter((line) => !line.startsWith('Merge '))
  );
}

function ensureCleanWorktree(options) {
  if (options.allowDirty || !isInsideGitRepo()) {
    return;
  }

  const status = tryRunCommand('git', ['status', '--short']);
  if (status && status.trim().length > 0) {
    throw new Error('Working tree is not clean. Commit your changes or rerun with --allow-dirty.');
  }
}

function isInsideGitRepo() {
  return tryRunCommand('git', ['rev-parse', '--is-inside-work-tree']) === 'true';
}

function resolveNextVersion(currentVersion, target, preidValue) {
  if (isSemver(target)) {
    return target;
  }

  return bumpSemver(currentVersion, target, preidValue);
}

function bumpSemver(version, releaseType, preidValue) {
  const match = version.match(/^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/);
  if (!match) {
    throw new Error(`Unsupported version format: ${version}`);
  }

  let major = Number(match[1]);
  let minor = Number(match[2]);
  let patch = Number(match[3]);
  const prerelease = match[4] ?? null;

  switch (releaseType) {
    case 'patch':
      patch += 1;
      return `${major}.${minor}.${patch}`;
    case 'minor':
      minor += 1;
      patch = 0;
      return `${major}.${minor}.${patch}`;
    case 'major':
      major += 1;
      minor = 0;
      patch = 0;
      return `${major}.${minor}.${patch}`;
    case 'prepatch':
      patch += 1;
      return `${major}.${minor}.${patch}-${preidValue}.0`;
    case 'preminor':
      minor += 1;
      patch = 0;
      return `${major}.${minor}.${patch}-${preidValue}.0`;
    case 'premajor':
      major += 1;
      minor = 0;
      patch = 0;
      return `${major}.${minor}.${patch}-${preidValue}.0`;
    case 'prerelease':
      if (!prerelease) {
        patch += 1;
        return `${major}.${minor}.${patch}-${preidValue}.0`;
      }

      return incrementPrerelease(version, prerelease, preidValue);
    default:
      throw new Error(
        `Unsupported version target "${releaseType}". Use an explicit semver or one of patch, minor, major, prepatch, preminor, premajor, prerelease.`
      );
  }
}

function incrementPrerelease(version, prerelease, preidValue) {
  const parts = prerelease.split('.');
  const lastPart = parts.at(-1);
  const numeric = lastPart && /^\d+$/.test(lastPart) ? Number(lastPart) : null;

  if (parts[0] !== preidValue) {
    const baseVersion = version.split('-')[0];
    return `${baseVersion}-${preidValue}.0`;
  }

  if (numeric == null) {
    return `${version}.0`;
  }

  parts[parts.length - 1] = String(numeric + 1);
  return `${version.split('-')[0]}-${parts.join('.')}`;
}

function renderChangelogEntry({ packageName, version, notes, date }) {
  const bullets = notes.map((note) => `- ${note}`).join('\n');
  return `## ${version} - ${date}\n\nPackage: \`${packageName}\`\n\n${bullets}\n`;
}

function upsertChangelogEntry(existing, entry, version) {
  const normalized = existing.endsWith('\n') ? existing : `${existing}\n`;
  const header = '# Changelog';
  const sectionHeader = `## ${version} - `;

  if (!normalized.startsWith(header)) {
    return `${header}\n\nAll notable changes to this package will be documented in this file.\n\n${entry}`;
  }

  if (normalized.includes(sectionHeader)) {
    const pattern = new RegExp(`## ${escapeRegExp(version)} - [^\\n]+[\\s\\S]*?(?=\\n## |$)`, 'm');
    return normalized.replace(pattern, entry.trimEnd());
  }

  const marker = 'All notable changes to this package will be documented in this file.\n';
  if (normalized.includes(marker)) {
    return normalized.replace(marker, `${marker}\n${entry}\n`);
  }

  return `${normalized.trimEnd()}\n\n${entry}\n`;
}

function runPackageManagerScript(scriptName) {
  runCommand('npm', ['run', scriptName]);
}

function runCommand(commandName, args) {
  const result = spawnSync(commandName, args, {
    cwd,
    stdio: 'inherit',
    shell: false,
  });

  if (result.status !== 0) {
    throw new Error(`Command failed: ${commandName} ${args.join(' ')}`);
  }
}

function tryRunCommand(commandName, args) {
  const result = spawnSync(commandName, args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
    shell: false,
  });

  if (result.status !== 0) {
    return '';
  }

  return result.stdout.trim();
}

function parseArgs(args) {
  const positionalValues = [];
  const parsedOptions = {};

  for (let index = 0; index < args.length; index += 1) {
    const value = args[index];

    if (!value.startsWith('--')) {
      positionalValues.push(value);
      continue;
    }

    const optionName = value.slice(2);
    if (['dry-run', 'allow-dirty', 'skip-checks'].includes(optionName)) {
      parsedOptions[camelCase(optionName)] = true;
      continue;
    }

    const nextValue = args[index + 1];
    if (!nextValue || nextValue.startsWith('--')) {
      throw new Error(`Missing value for option --${optionName}`);
    }

    parsedOptions[camelCase(optionName)] = nextValue;
    index += 1;
  }

  return { positional: positionalValues, options: parsedOptions };
}

function ensureVersionTarget(target) {
  if (target) {
    return;
  }

  throw new Error('A version target is required. Use an explicit version like 0.2.0 or a bump keyword like patch.');
}

function printSummary(title, info) {
  console.log(`\n${title}`);
  console.log(`- package: ${info.packageName}`);
  console.log(`- current version: ${info.currentVersion}`);
  console.log(`- next version: ${info.nextVersion}`);
  console.log(`- dry run: ${info.dryRun ? 'yes' : 'no'}`);
  console.log(`- changelog: ${path.relative(cwd, changelogPath)}`);
}

function printHelp() {
  console.log(`
Usage:
  pnpm release:prepare <version|patch|minor|major|prepatch|preminor|premajor|prerelease> [--notes "..."] [--notes-file path]
  pnpm release:publish [--tag beta] [--dry-run] [--skip-checks]
  pnpm release <version-target> [--notes "..."] [--notes-file path] [--tag beta]

Options:
  --notes        Inline release notes. Multiple lines become multiple bullets.
  --notes-file   Path to a markdown or text file with release notes.
  --preid        Prerelease identifier, default: rc
  --tag          npm dist-tag for publish, for example beta
  --dry-run      Preview writes or npm publish without sending the package
  --allow-dirty  Allow running release prep with uncommitted changes
  --skip-checks  Skip typecheck, test, and build during publish
`);
}

function splitNotes(value) {
  return value
    .replace(/\\n/g, '\n')
    .split('\n')
    .map((line) => line.replace(/^\s*[-*]\s*/, '').trim())
    .filter((line) => line.length > 0);
}

function dedupe(values) {
  return [...new Set(values)];
}

function formatDate(date) {
  return date.toISOString().slice(0, 10);
}

function camelCase(value) {
  return value.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
}

function isSemver(value) {
  return /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(value);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}
