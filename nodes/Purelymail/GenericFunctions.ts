import type { IDataObject, IExecuteFunctions, ILoadOptionsFunctions } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

export const API_BASE_URL = 'https://purelymail.com';
export const API_PATH_PREFIX = '/api/v0/';

export const DEFAULT_ERROR_MESSAGE = 'Purelymail reported an error without a message';

type PurelymailContext = IExecuteFunctions | ILoadOptionsFunctions;

/** Every endpoint is a POST under /api/v0/, so the address is built in one place. */
export function buildApiUrl(endpoint: string): string {
	return `${API_BASE_URL}${API_PATH_PREFIX}${endpoint.replace(/^\/+/, '')}`;
}

export interface PurelymailError {
	code: string;
	message: string;
}

/**
 * Purelymail answers HTTP 200 even when it fails, with a body shaped `{type: "error", code, message}`.
 * Verified against the live API: a rejected token returns 200 and `invalidToken`, so the status code
 * alone is worthless and the body has to be inspected.
 */
export function errorFromBody(body: unknown): PurelymailError | undefined {
	if (body === null || typeof body !== 'object') return undefined;
	const record = body as Record<string, unknown>;
	if (record.type !== 'error') return undefined;
	return {
		code: typeof record.code === 'string' ? record.code : 'unknown',
		message: typeof record.message === 'string' ? record.message : DEFAULT_ERROR_MESSAGE,
	};
}

/** Successful calls wrap their payload in `result`; this returns the payload itself. */
export function unwrapResult(body: unknown): unknown {
	if (body !== null && typeof body === 'object' && 'result' in (body as Record<string, unknown>)) {
		return (body as Record<string, unknown>).result;
	}
	return body;
}

export function parseAddressList(raw: string): string[] {
	return raw
		.split(',')
		.map((address) => address.trim())
		.filter((address) => address !== '');
}

/**
 * Turns a result into n8n items. List endpoints answer either with an array or with a single
 * property holding one, such as `{users: [...]}` or `{rules: [...]}`, so both shapes produce one item
 * per record rather than one item wrapping everything.
 */
export function toItems(result: unknown, primitiveKey = 'value'): IDataObject[] {
	if (Array.isArray(result)) {
		return result.map((entry) =>
			entry !== null && typeof entry === 'object' ? (entry as IDataObject) : { [primitiveKey]: entry },
		);
	}
	if (result !== null && typeof result === 'object') {
		const record = result as Record<string, unknown>;
		const keys = Object.keys(record);
		if (keys.length === 1) {
			const only = record[keys[0]];
			if (Array.isArray(only)) {
				return only.map((entry) =>
					entry !== null && typeof entry === 'object' ? (entry as IDataObject) : { [primitiveKey]: entry },
				);
			}
		}
		if (keys.length === 0) return [{}];
		return [record as IDataObject];
	}
	if (result === undefined || result === null) return [{}];
	return [{ [primitiveKey]: result }];
}

export type RoutingMatchType = 'exact' | 'prefix' | 'catchall';

/**
 * Purelymail wants raw booleans for a routing rule: `prefix` says whether the match is a prefix,
 * `catchall` says whether the rule may take mail that is not a mailbox at all. Those two flags plus
 * an optional match user cover their four real-world match kinds, so the node offers the kinds and
 * translates here instead of making a user reason about booleans.
 */
export function buildRoutingRuleBody(input: {
	domainName: string;
	matchType: RoutingMatchType;
	matchUser?: string;
	targetAddresses: string[];
}): IDataObject {
	const body: IDataObject = {
		domainName: input.domainName,
		prefix: input.matchType === 'prefix',
		catchall: input.matchType === 'catchall',
		matchUser: input.matchType === 'catchall' ? '' : (input.matchUser ?? ''),
		targetAddresses: input.targetAddresses,
	};
	return body;
}

export async function purelymailRequest(
	ctx: PurelymailContext,
	endpoint: string,
	body: IDataObject = {},
): Promise<unknown> {
	let response: unknown;
	try {
		response = await ctx.helpers.httpRequestWithAuthentication.call(ctx, 'purelymailApi', {
			method: 'POST',
			url: buildApiUrl(endpoint),
			headers: { 'Content-Type': 'application/json' },
			// Sent as a string deliberately. n8n drops an empty object body entirely, leaving
			// `Content-Type: application/json` over no body at all, and Purelymail answers that with
			// invalidRequest, "Request could not be parsed." Every parameterless call does this, so
			// checkAccountCredit, getOwnershipCode, listUser and listRoutingRules all failed against a
			// live account. Serialising here guarantees a parseable body is always present.
			body: JSON.stringify(body),
			json: true,
		});
	} catch (error) {
		const failure = error as { httpCode?: string; statusCode?: number; response?: { status?: number } };
		const status = failure.statusCode ?? failure.response?.status ?? failure.httpCode;
		const label = status === undefined ? '' : String(status);
		if (label === '404') {
			throw new NodeOperationError(
				ctx.getNode(),
				`Purelymail does not have an endpoint at ${buildApiUrl(endpoint)}`,
			);
		}
		throw new NodeOperationError(ctx.getNode(), 'The request to Purelymail failed', {
			description: `${label === '' ? '' : `HTTP ${label}. `}${(error as Error).message}`,
		});
	}

	const reported = errorFromBody(response);
	if (reported !== undefined) {
		throw new NodeOperationError(ctx.getNode(), `Purelymail refused the request: ${reported.message}`, {
			description: `Purelymail error code: ${reported.code}`,
		});
	}

	return unwrapResult(response);
}
