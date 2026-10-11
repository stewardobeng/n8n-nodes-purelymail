import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
	buildApiUrl,
	buildRoutingRuleBody,
	errorFromBody,
	parseAddressList,
	purelymailRequest,
	toItems,
	unwrapResult,
} from '../dist/nodes/Purelymail/GenericFunctions.js';

/** The exact body Purelymail returns for a rejected call, captured from the live API. */
const LIVE_REJECTION = {
	type: 'error',
	code: 'invalidToken',
	message: 'Token must be supplied in Purelymail-Api-Token header',
};

function fakeContext(response, credentialOverrides = {}) {
	const calls = [];
	const ctx = {
		getNode: () => ({
			name: 'Purelymail',
			type: 'n8n-nodes-purelymail.purelymail',
			typeVersion: 1,
			position: [0, 0],
			parameters: {},
		}),
		getCredentials: async () => ({
			apiToken: 'pm_test_token',
			...credentialOverrides,
		}),
		helpers: {
			httpRequestWithAuthentication: {
				async call(_ctx, credentialType, options) {
					calls.push({ credentialType, options });
					if (typeof response === 'function') return response(options);
					return response;
				},
			},
		},
	};
	return { ctx, calls };
}

test('every endpoint is called as an absolute POST url under /api/v0/', () => {
	assert.equal(buildApiUrl('listUser'), 'https://purelymail.com/api/v0/listUser');
	assert.equal(buildApiUrl('/listUser'), 'https://purelymail.com/api/v0/listUser');
	assert.equal(buildApiUrl('createRoutingRule'), 'https://purelymail.com/api/v0/createRoutingRule');
});

test('an error body is detected, even though the HTTP status was 200', () => {
	assert.deepEqual(errorFromBody(LIVE_REJECTION), {
		code: 'invalidToken',
		message: 'Token must be supplied in Purelymail-Api-Token header',
	});
});

test('a successful body is not mistaken for an error', () => {
	assert.equal(errorFromBody({ result: { users: ['a@b.com'] } }), undefined);
	assert.equal(errorFromBody({}), undefined);
	assert.equal(errorFromBody('not an object'), undefined);
	assert.equal(errorFromBody(null), undefined);
});

test('an error without a message still reports its code', () => {
	const error = errorFromBody({ type: 'error', code: 'invalidDomain' });
	assert.equal(error.code, 'invalidDomain');
	assert.match(error.message, /without a message/);
});

test('results are unwrapped from the result property, and untouched otherwise', () => {
	assert.deepEqual(unwrapResult({ result: { users: ['a@b.com'] } }), { users: ['a@b.com'] });
	assert.equal(unwrapResult({ result: 'plain' }), 'plain');
	assert.deepEqual(unwrapResult({ users: ['a@b.com'] }), { users: ['a@b.com'] });
});

test('the headline trap: a rejected request raises Purelymail\u2019s own code and message', async () => {
	const { ctx, calls } = fakeContext(LIVE_REJECTION);

	await assert.rejects(
		() => purelymailRequest(ctx, 'listUser', {}),
		(error) => {
			assert.equal(error.name, 'NodeOperationError');
			assert.match(error.message, /Purelymail refused the request/);
			assert.match(error.message, /Token must be supplied in Purelymail-Api-Token header/);
			assert.match(error.description, /invalidToken/);
			return true;
		},
	);

	assert.equal(calls[0].credentialType, 'purelymailApi');
	assert.equal(calls[0].options.url, 'https://purelymail.com/api/v0/listUser');
	assert.equal(calls[0].options.method, 'POST');
});

test('a successful request returns the payload inside result', async () => {
	const { ctx } = fakeContext({ result: { users: ['a@b.com', 'c@d.com'] } });
	assert.deepEqual(await purelymailRequest(ctx, 'listUser', {}), { users: ['a@b.com', 'c@d.com'] });
});

test('an HTTP failure is reported with the status and the original reason', async () => {
	const { ctx } = fakeContext(() => {
		const error = new Error('Not Found');
		error.httpCode = '404';
		throw error;
	});

	await assert.rejects(
		() => purelymailRequest(ctx, 'inventedEndpoint', {}),
		/Purelymail does not have an endpoint at https:\/\/purelymail\.com\/api\/v0\/inventedEndpoint/,
	);
});

test('address lists are split on commas and trimmed', () => {
	assert.deepEqual(parseAddressList('a@b.com, c@d.com'), ['a@b.com', 'c@d.com']);
	assert.deepEqual(parseAddressList(' a@b.com ,, '), ['a@b.com']);
	assert.deepEqual(parseAddressList(''), []);
});

test('routing match types translate into Purelymail\u2019s booleans', () => {
	const exact = buildRoutingRuleBody({
		domainName: 'example.com',
		matchType: 'exact',
		matchUser: 'sales',
		targetAddresses: ['owner@example.com'],
	});
	assert.deepEqual(exact, {
		domainName: 'example.com',
		prefix: false,
		catchall: false,
		matchUser: 'sales',
		targetAddresses: ['owner@example.com'],
	});

	const prefix = buildRoutingRuleBody({
		domainName: 'example.com',
		matchType: 'prefix',
		matchUser: 'info',
		targetAddresses: ['owner@example.com'],
	});
	assert.equal(prefix.prefix, true);
	assert.equal(prefix.catchall, false);
	assert.equal(prefix.matchUser, 'info');

	const catchall = buildRoutingRuleBody({
		domainName: 'example.com',
		matchType: 'catchall',
		matchUser: 'ignored',
		targetAddresses: ['owner@example.com'],
	});
	assert.equal(catchall.prefix, false);
	assert.equal(catchall.catchall, true);
	assert.equal(catchall.matchUser, '', 'a catch-all matches any address, so no match user is sent');
});

test('listings become one item per record, whatever wrapper Purelymail uses', () => {
	assert.deepEqual(toItems({ users: ['a@b.com', 'c@d.com'] }, 'userName'), [
		{ userName: 'a@b.com' },
		{ userName: 'c@d.com' },
	]);
	assert.deepEqual(toItems({ rules: [{ id: 1 }, { id: 2 }] }), [{ id: 1 }, { id: 2 }]);
	assert.deepEqual(toItems([{ id: 1 }]), [{ id: 1 }]);
	assert.deepEqual(toItems({ credit: '12.34' }), [{ credit: '12.34' }]);
	assert.deepEqual(toItems({}), [{}]);
	assert.deepEqual(toItems(null), [{}]);
	assert.deepEqual(toItems('plain'), [{ value: 'plain' }]);
});

test('the encrypted token never appears in code, only in the credential', async () => {
	const { ctx, calls } = fakeContext({ result: {} });
	await purelymailRequest(ctx, 'listUser', {});
	assert.equal(calls[0].options.headers?.['Purelymail-Api-Token'], undefined);
	assert.equal(calls[0].options.headers?.['Content-Type'], 'application/json');
});
