import type { ICredentialTestRequest, ICredentialType, INodeProperties } from 'n8n-workflow';

export class PurelymailApi implements ICredentialType {
	name = 'purelymailApi';

	displayName = 'Purelymail API';

	documentationUrl = 'https://purelymail.com/docs/';

	icon = { light: 'file:purelymail.svg', dark: 'file:purelymail.dark.svg' } as const;

	properties: INodeProperties[] = [
		{
			displayName: 'API Token',
			name: 'apiToken',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			required: true,
			description:
				'Your Purelymail API token, sent as the Purelymail-Api-Token header. Get it from the Purelymail account management page by clicking Refresh API Key.',
		},
	];

	authenticate = {
		type: 'generic' as const,
		properties: {
			headers: {
				'Purelymail-Api-Token': '={{$credentials.apiToken}}',
			},
		},
	};

	// Purelymail also returns HTTP 200 for API errors; inspect the response body.
	test: ICredentialTestRequest = {
		request: {
			baseURL: 'https://purelymail.com',
			url: '/api/v0/listUser',
			method: 'POST' as const,
			headers: {
				'Content-Type': 'application/json',
			},
			body: '{}',
			json: true,
		},
		rules: [
			{
				type: 'responseSuccessBody',
				properties: {
					key: 'type',
					value: 'error',
					message: 'Purelymail rejected the credential test. Check your API token and account access.',
				},
			},
		],
	};
}
