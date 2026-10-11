import type { ICredentialType, INodeProperties } from 'n8n-workflow';

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
		{
			displayName:
				'Note: Purelymail answers with success even when the API key is wrong, so a green connection test does not prove it. Run any Purelymail operation to confirm.',
			name: 'connectionTestNotice',
			type: 'notice',
			default: '',
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

	/**
	 * Purelymail replies HTTP 200 with an error body for a rejected token, so this test only proves
	 * the host is reachable and the header is being sent. The node performs the real check: it reads
	 * the body and raises the error code and message. A notice on the credential says so too.
	 */
	test = {
		request: {
			baseURL: 'https://purelymail.com',
			url: '/api/v0/listUser',
			method: 'POST' as const,
			headers: {
				'Content-Type': 'application/json',
			},
			body: {},
			json: true,
		},
	};
}
