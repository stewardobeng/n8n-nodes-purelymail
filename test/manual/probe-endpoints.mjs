#!/usr/bin/env node
/**
 * Live probe for the Purelymail API, used to confirm what the node assumes.
 *
 * Phase 1 is read-only and always runs: it lists users, domains, routing rules and recovery methods,
 * fetches one user, and checks the credit. Nothing on the account changes.
 *
 * Phase 2 runs only with PROBE_ALLOW_INVALID_CALLS=1. It sends empty bodies to the endpoints that
 * create or delete things. Those calls are deliberately invalid, so they are refused with a
 * validation error and nothing is created or deleted; the point is to capture the error shape and
 * prove the routes exist. Do not use this script for anything that mutates data.
 *
 * Usage:
 *   PURELYMAIL_API_TOKEN=... node test/manual/probe-endpoints.mjs
 *   PURELYMAIL_API_TOKEN=... PROBE_ALLOW_INVALID_CALLS=1 node test/manual/probe-endpoints.mjs
 *
 * The token is read from the environment, sent only as the Purelymail-Api-Token header, and never
 * printed by this script.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE = 'https://purelymail.com';
const PREFIX = '/api/v0/';
const token = process.env.PURELYMAIL_API_TOKEN ?? '';

if (token === '') {
	console.error('Set PURELYMAIL_API_TOKEN in the environment first. Do not pass it as an argument.');
	process.exit(2);
}

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const report = { probedAt: new Date().toISOString(), phase1: [], phase2: [] };

function redact(value) {
	const text = typeof value === 'string' ? value : JSON.stringify(value);
	return text.replace(/[A-Za-z0-9_-]{24,}/g, '<redacted>').slice(0, 600);
}

async function call(endpoint, body = {}) {
	const response = await fetch(`${BASE}${PREFIX}${endpoint}`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json', 'Purelymail-Api-Token': token },
		body: JSON.stringify(body),
	});
	const text = await response.text();
	let parsed;
	try {
		parsed = JSON.parse(text);
	} catch {
		parsed = text.slice(0, 200);
	}
	return { status: response.status, body: parsed };
}

function summarise(result) {
	if (result.body !== null && typeof result.body === 'object' && result.body.type === 'error') {
		return `error ${result.body.code}: ${result.body.message}`;
	}
	const keys = result.body !== null && typeof result.body === 'object' ? Object.keys(result.body) : [];
	return `ok, keys: ${keys.join(', ') || '(none)'}`;
}

async function phase1() {
	console.log('== phase 1: read-only calls');
	const plan = [
		['listUser', {}],
		['listDomains', { includeShared: false }],
		['listRoutingRules', {}],
		['getOwnershipCode', {}],
		['checkAccountCredit', {}],
	];

	for (const [endpoint, body] of plan) {
		const result = await call(endpoint, body);
		console.log(`   ${endpoint.padEnd(22)} HTTP ${result.status}  ${summarise(result)}`);
		report.phase1.push({ endpoint, request: body, ...result });
	}

	// Follow-ups that need an address: use a real one from the account rather than inventing it.
	const users = report.phase1.find((entry) => entry.endpoint === 'listUser')?.body?.result?.users;
	if (Array.isArray(users) && users.length > 0 && typeof users[0] === 'string') {
		const userName = users[0];
		for (const endpoint of ['getUser', 'listPasswordReset']) {
			const result = await call(endpoint, { userName });
			const label = `${endpoint} (${userName.replace(/^(.{2}).*(@.*)$/, '$1***$2')})`;
			console.log(`   ${label.padEnd(22)} HTTP ${result.status}  ${summarise(result)}`);
			report.phase1.push({ endpoint, request: { userName: '<redacted>' }, ...result });
		}
	} else {
		console.log('   no users on the account, so getUser and listPasswordReset were skipped');
	}
}

async function phase2() {
	console.log('\n== phase 2: invalid calls, to capture validation and prove the routes exist');
	const dangerous = [
		'createUser',
		'modifyUser',
		'deleteUser',
		'createAppPassword',
		'deleteAppPassword',
		'addDomain',
		'deleteDomain',
		'updateDomainSettings',
		'createRoutingRule',
		'deleteRoutingRule',
		'upsertPasswordReset',
		'deletePasswordReset',
	];

	for (const endpoint of dangerous) {
		// An empty body cannot satisfy any of these, so the call is refused and nothing changes.
		const result = await call(endpoint, {});
		console.log(`   ${endpoint.padEnd(22)} HTTP ${result.status}  ${summarise(result)}`);
		report.phase2.push({ endpoint, request: {}, ...result });
	}
}

try {
	await phase1();
	if (process.env.PROBE_ALLOW_INVALID_CALLS === '1') {
		await phase2();
	} else {
		console.log('\n== phase 2 skipped (set PROBE_ALLOW_INVALID_CALLS=1 to run the invalid-body calls)');
	}
} catch (error) {
	console.error('probe failed:', error.message);
	process.exitCode = 1;
}

mkdirSync(join(root, 'test', 'fixtures'), { recursive: true });
const out = join(root, 'test', 'fixtures', 'live-probe.json');
writeFileSync(out, JSON.stringify(report, null, 2));
console.log(`\nreport written to ${out}`);
console.log(`summary: ${redact(JSON.stringify(report)).length} characters of evidence recorded`);
