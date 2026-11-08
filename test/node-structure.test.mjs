import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { Purelymail } from '../dist/nodes/Purelymail/Purelymail.node.js';
import { PurelymailApi } from '../dist/credentials/PurelymailApi.credentials.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const description = new Purelymail().description;
const credential = new PurelymailApi();
const source = readFileSync(join(root, 'nodes/Purelymail/Purelymail.node.ts'), 'utf8');

/** The 19 endpoints Purelymail's own OpenAPI spec documents. */
const DOCUMENTED_ENDPOINTS = [
	'addDomain',
	'checkAccountCredit',
	'createAppPassword',
	'createRoutingRule',
	'createUser',
	'deleteAppPassword',
	'deleteDomain',
	'deletePasswordReset',
	'deleteRoutingRule',
	'deleteUser',
	'getOwnershipCode',
	'getUser',
	'listDomains',
	'listPasswordReset',
	'listRoutingRules',
	'listUser',
	'modifyUser',
	'updateDomainSettings',
	'upsertPasswordReset',
];

const operationsFor = (resource) =>
	description.properties
		.filter((p) => p.name === 'operation')
		.find((p) => p.displayOptions.show.resource.includes(resource))
		.options.map((o) => o.value)
		.sort();

test('the node covers all five resources Purelymail groups its API into', () => {
	const resources = description.properties
		.find((p) => p.name === 'resource')
		.options.map((o) => o.value)
		.sort();
	assert.deepEqual(resources, ['billing', 'domain', 'passwordReset', 'routing', 'user']);
});

test('each resource exposes the operations its endpoints allow', () => {
	assert.deepEqual(operationsFor('user'), [
		'create',
		'createAppPassword',
		'delete',
		'deleteAppPassword',
		'get',
		'list',
		'modify',
	]);
	assert.deepEqual(operationsFor('domain'), ['add', 'delete', 'list', 'ownershipCode', 'updateSettings']);
	assert.deepEqual(operationsFor('routing'), ['create', 'delete', 'list']);
	assert.deepEqual(operationsFor('passwordReset'), ['delete', 'list', 'upsert']);
	assert.deepEqual(operationsFor('billing'), ['checkCredit']);
});

test('every endpoint in Purelymail\u2019s spec is actually reachable from the node', () => {
	const endpointsUsed = [...source.matchAll(/endpoint = '([A-Za-z]+)'/g)].map((m) => m[1]);
	for (const documented of DOCUMENTED_ENDPOINTS) {
		assert.ok(
			endpointsUsed.includes(documented),
			`${documented} is documented by Purelymail but the node never calls it`,
		);
	}
	assert.equal(new Set(endpointsUsed).size, DOCUMENTED_ENDPOINTS.length, 'no invented endpoints');
});

test('the node can be used as an AI agent tool', () => {
	assert.equal(description.usableAsTool, true);
});

test('every parameter and every operation documents itself', () => {
	for (const property of description.properties) {
		if (property.name === 'resource' || property.name === 'operation') {
			for (const option of property.options) {
				assert.ok(option.description, `${option.value} needs a description`);
			}
			continue;
		}
		assert.ok(property.description, `parameter ${property.name} needs a description`);
		assert.ok(property.displayName, `parameter ${property.name} needs a display name`);
	}
});

test('routing offers match types instead of raw booleans', () => {
	const matchType = description.properties.find((p) => p.name === 'matchType');
	assert.deepEqual(matchType.options.map((o) => o.value), ['exact', 'prefix', 'catchall']);

	// The match address only applies to exact and prefix rules, and is hidden for a catch-all.
	const matchUser = description.properties.find((p) => p.name === 'matchUser');
	assert.deepEqual(matchUser.displayOptions.show.matchType, ['exact', 'prefix']);
});

test('the credential sends the Purelymail-Api-Token header', () => {
	assert.equal(
		credential.authenticate.properties.headers['Purelymail-Api-Token'],
		'={{$credentials.apiToken}}',
	);
	const token = credential.properties.find((p) => p.name === 'apiToken');
	assert.equal(token.typeOptions.password, true, 'the token must be masked in the UI');

	assert.equal(credential.test.request.url, '/api/v0/listUser');
	assert.ok(credential.test.rules.some((rule) => rule.type === 'responseSuccessBody' &&
		rule.properties.key === 'type' && rule.properties.value === 'error'));
});

test('the label field is not masked, because a label is not a secret', () => {
	const label = description.properties.find((p) => p.name === 'label');
	assert.ok(label, 'the app password label field must exist');
	assert.equal(label.typeOptions, undefined, 'a label must stay readable');
	assert.match(label.description, /not a secret/);
});

test('every referenced icon exists as an SVG, in both themes', () => {
	const refs = [];
	const collect = (icon, base) => {
		if (typeof icon === 'string') refs.push([icon, base]);
		else for (const variant of Object.values(icon)) refs.push([variant, base]);
	};
	collect(description.icon, 'nodes/Purelymail');
	collect(credential.icon, 'credentials');
	assert.equal(refs.length, 4, 'expected light and dark icons for the node and the credential');

	for (const [ref, base] of refs) {
		const file = join(root, base, ref.replace('file:', ''));
		assert.ok(existsSync(file), `${file} is referenced but missing`);
		const svg = readFileSync(file, 'utf8');
		assert.match(svg, /<svg/);
		assert.match(svg, /viewBox="0 0 [0-9.]+ [0-9.]+"/);
	}
});

test('the package declares what n8n loads, with no runtime dependencies', () => {
	const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
	assert.equal(pkg.name, 'n8n-nodes-purelymail');
	assert.deepEqual(pkg.n8n.nodes, ['dist/nodes/Purelymail/Purelymail.node.js']);
	assert.deepEqual(pkg.n8n.credentials, ['dist/credentials/PurelymailApi.credentials.js']);
	assert.equal(pkg.dependencies, undefined, 'community nodes must ship no runtime dependencies');
	assert.equal(pkg.peerDependencies['n8n-workflow'], '*');
	assert.ok(pkg.keywords.includes('n8n-community-node-package'));
});
