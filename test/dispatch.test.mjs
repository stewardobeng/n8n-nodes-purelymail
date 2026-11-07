import assert from 'node:assert/strict';
import { test } from 'node:test';

import { Purelymail } from '../dist/nodes/Purelymail/Purelymail.node.js';

/**
 * Drives the node's execute() with a stub context, so the dispatcher can be tested without n8n and
 * without touching the live API.
 */
function stubContext(params, response = { result: {} }) {
	const calls = [];
	const ctx = {
		getInputData: () => [{}],
		getNodeParameter: (name, _index, fallback) => (name in params ? params[name] : fallback),
		getNode: () => ({
			name: 'Purelymail',
			type: 'n8n-nodes-purelymail.purelymail',
			typeVersion: 1,
			position: [0, 0],
			parameters: params,
		}),
		continueOnFail: () => false,
		helpers: {
			httpRequestWithAuthentication: {
				async call(_ctx, credentialType, options) {
					calls.push({ credentialType, options });
					return typeof response === 'function' ? response(options) : response;
				},
			},
		},
	};
	return { ctx, calls };
}

const run = (params, response) => {
	const { ctx, calls } = stubContext(params, response);
	return { promise: new Purelymail().execute.call(ctx), calls };
};

test('an unset operation is refused instead of falling through to a destructive branch', async () => {
	// The dispatcher used to end each resource with a bare else, and for the domain resource that
	// branch is deleteDomain. A tool node filled in by an AI agent can leave the operation out, so this
	// guards against a missing operation deleting a domain.
	for (const resource of ['domain', 'user', 'routing', 'passwordReset']) {
		const { promise, calls } = run({ resource });
		await assert.rejects(promise, (error) => {
			assert.match(error.message, /Unknown operation/);
			assert.match(error.message, new RegExp(resource));
			return true;
		});
		assert.equal(calls.length, 0, `${resource} must not reach Purelymail with no operation set`);
	}
});

test('an operation the node does not know is refused, and nothing is sent', async () => {
	const { promise, calls } = run({ resource: 'billing', operation: 'deleteEverything' });
	await assert.rejects(promise, /Unknown operation/);
	assert.equal(calls.length, 0);
});

test('check credit calls the right endpoint and returns the credit as an item', async () => {
	const { promise, calls } = run(
		{ resource: 'billing', operation: 'checkCredit' },
		{ result: { credit: '13.37' } },
	);
	const output = await promise;

	assert.deepEqual(output, [[{ json: { credit: '13.37' }, pairedItem: { item: 0 } }]]);
	assert.equal(calls.length, 1);
	assert.equal(calls[0].credentialType, 'purelymailApi');
	assert.equal(calls[0].options.url, 'https://purelymail.com/api/v0/checkAccountCredit');
	assert.equal(calls[0].options.method, 'POST');
	assert.equal(calls[0].options.body, '{}', 'a parameterless call must still carry a parseable body');
});

test('a billing node saved without an operation still checks the credit, because that is the only one', async () => {
	// This is how the node arrived from the user's workflow: resource billing, no operation. It must
	// keep working rather than becoming an error, since billing has exactly one operation.
	const { promise, calls } = run(
		{ resource: 'billing', targetAddresses: 'someone@example.com' },
		{ result: { credit: '0.01' } },
	);
	const output = await promise;
	assert.equal(output[0][0].json.credit, '0.01');
	assert.equal(calls[0].options.url, 'https://purelymail.com/api/v0/checkAccountCredit');
	assert.equal(calls[0].options.body, '{}');
});

test('list routing rules reaches its endpoint with a body, and produces one item per rule', async () => {
	const { promise, calls } = run(
		{ resource: 'routing', operation: 'list' },
		{ result: { rules: [{ id: 1 }, { id: 2 }] } },
	);
	const output = await promise;
	assert.equal(output[0].length, 2);
	assert.equal(calls[0].options.url, 'https://purelymail.com/api/v0/listRoutingRules');
	assert.equal(calls[0].options.body, '{}');
});

test('a rejected call surfaces Purelymail\u2019s code even though the HTTP status was 200', async () => {
	const { promise } = run(
		{ resource: 'billing', operation: 'checkCredit' },
		{ type: 'error', code: 'invalidRequest', message: 'Request could not be parsed.' },
	);
	await assert.rejects(promise, (error) => {
		assert.match(error.message, /Request could not be parsed/);
		assert.match(error.description, /invalidRequest/);
		return true;
	});
});

test('a successful delete returns the n8n confirmation, while a failed delete is rejected', async () => {
	const params = { resource: 'domain', operation: 'delete', domainNameNamed: 'example.com' };
	const success = run(params, { result: { message: 'removed' } });
	assert.deepEqual(await success.promise, [[{ json: { deleted: true }, pairedItem: { item: 0 } }]]);
	assert.match(success.calls[0].options.url, /deleteDomain$/);
	const failure = run(params, { type: 'error', code: 'denied', message: 'Denied' });
	await assert.rejects(failure.promise, /Denied/);
});
