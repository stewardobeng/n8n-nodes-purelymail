import type {
	IDataObject,
	IExecuteFunctions,
	INodeExecutionData,
	INodeProperties,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';
import { NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';

import {
	buildRoutingRuleBody,
	parseAddressList,
	purelymailRequest,
	toItems,
	type RoutingMatchType,
} from './GenericFunctions';

/** Some fields are booleans where "leave it alone" is a valid third choice, so they are tri-state. */
const triStateOptions = [
	{ name: 'Leave Unchanged', value: '', description: 'Do not send this setting at all' },
	{ name: 'Enable', value: 'true', description: 'Turn this setting on' },
	{ name: 'Disable', value: 'false', description: 'Turn this setting off' },
];

const triState = (displayName: string, name: string, description: string): INodeProperties => ({
	displayName,
	name,
	type: 'options',
	options: triStateOptions,
	default: '',
	description,
});

const addressesField: INodeProperties = {
	displayName: 'Forward To',
	name: 'targetAddresses',
	type: 'string',
	default: '',
	required: true,
	placeholder: 'owner@example.com, second@example.com',
	description:
		'Where matching mail should be sent. Add several addresses separated by commas, and note that any address is allowed, including one outside Purelymail.',
};

const resourceOptions: INodeProperties = {
	displayName: 'Resource',
	name: 'resource',
	type: 'options',
	noDataExpression: true,
	options: [
		{ name: 'Billing', value: 'billing', description: 'Check the credit on the account' },
		{ name: 'Domain', value: 'domain', description: 'Add, list, configure or remove domains' },
		{
			name: 'Password Reset',
			value: 'passwordReset',
			description: 'Manage the email or phone recovery methods a user can reset with',
		},
		{
			name: 'Routing',
			value: 'routing',
			description: 'Forward or catch mail for a domain without creating a mailbox for every address',
		},
		{
			name: 'User',
			value: 'user',
			description: 'Manage mailboxes and their app passwords',
		},
	],
	default: 'user',
};

const operationOptions: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['user'] } },
		options: [
			{
				name: 'Create',
				value: 'create',
				description: 'Create a mailbox',
				action: 'Create a mailbox',
			},
			{
				name: 'Create App Password',
				value: 'createAppPassword',
				description: 'Create a password a mail client can use',
				action: 'Create an app password',
			},
			{
				name: 'Delete',
				value: 'delete',
				description: 'Delete a mailbox',
				action: 'Delete a mailbox',
			},
			{
				name: 'Delete App Password',
				value: 'deleteAppPassword',
				description: 'Delete one of a mailbox app passwords',
				action: 'Delete an app password',
			},
			{
				name: 'Get',
				value: 'get',
				description: 'Get one mailbox with its settings',
				action: 'Get a mailbox',
			},
			{
				name: 'List',
				value: 'list',
				description: 'List every mailbox on the account',
				action: 'List mailboxes',
			},
			{
				name: 'Modify',
				value: 'modify',
				description: 'Rename a mailbox, change its password, or change its settings',
				action: 'Modify a mailbox',
			},
		],
		default: 'create',
	},
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['domain'] } },
		options: [
			{ name: 'Add', value: 'add', description: 'Add a domain to the account', action: 'Add a domain' },
			{
				name: 'Delete',
				value: 'delete',
				description: 'Remove a domain from the account',
				action: 'Delete a domain',
			},
			{
				name: 'Get Ownership Code',
				value: 'ownershipCode',
				description: 'Get the code to place in DNS to prove you own the domain',
				action: 'Get the ownership code',
			},
			{
				name: 'List',
				value: 'list',
				description: 'List the domains on the account',
				action: 'List domains',
			},
			{
				name: 'Update Settings',
				value: 'updateSettings',
				description: 'Change account reset, subaddressing or recheck the DNS records',
				action: 'Update domain settings',
			},
		],
		default: 'list',
	},
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['routing'] } },
		options: [
			{
				name: 'Create',
				value: 'create',
				description: 'Create a forwarding or catch-all rule',
				action: 'Create a routing rule',
			},
			{
				name: 'Delete',
				value: 'delete',
				description: 'Delete a routing rule',
				action: 'Delete a routing rule',
			},
			{
				name: 'List',
				value: 'list',
				description: 'List the routing rules on the account',
				action: 'List routing rules',
			},
		],
		default: 'list',
	},
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['passwordReset'] } },
		options: [
			{
				name: 'Delete',
				value: 'delete',
				description: 'Remove a recovery method',
				action: 'Delete a recovery method',
			},
			{
				name: 'List',
				value: 'list',
				description: 'List a user recovery methods',
				action: 'List recovery methods',
			},
			{
				name: 'Create or Update',
				value: 'upsert',
				description: 'Create a new record, or update the current one if it already exists (upsert)',
				action: 'Upsert a recovery method',
			},
		],
		default: 'list',
	},
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['billing'] } },
		options: [
			{
				name: 'Check Credit',
				value: 'checkCredit',
				description: 'Show the credit currently on the account',
				action: 'Check the account credit',
			},
		],
		default: 'checkCredit',
	},
];

const fields: INodeProperties[] = [
	// ---- User: create
	{
		displayName: 'Mailbox Name',
		name: 'userName',
		type: 'string',
		default: '',
		required: true,
		placeholder: 'sales',
		description:
			'The part before the @ sign, so sales in sales@example.com. Attach the domain separately below.',
		displayOptions: { show: { resource: ['user'], operation: ['create'] } },
	},
	{
		displayName: 'Domain',
		name: 'domainName',
		type: 'string',
		default: '',
		required: true,
		placeholder: 'example.com',
		description: 'The domain the mailbox belongs to. It has to be added to the account already.',
		displayOptions: { show: { resource: ['user'], operation: ['create'] } },
	},
	{
		displayName: 'Password',
		name: 'password',
		type: 'string',
		typeOptions: { password: true },
		default: '',
		required: true,
		description: 'The initial password for this mailbox',
		displayOptions: { show: { resource: ['user'], operation: ['create'] } },
	},
	{
		displayName: 'Additional Fields',
		name: 'createOptions',
		type: 'collection',
		placeholder: 'Add Field',
		default: {},
		description:
			'Optional mailbox settings: recovery addresses, password reset, search indexing and the welcome email',
		displayOptions: { show: { resource: ['user'], operation: ['create'] } },
		options: [
			{
				displayName: 'Enable Password Reset',
				name: 'enablePasswordReset',
				type: 'boolean',
				default: true,
				description: 'Whether the user may reset their own password using their recovery methods',
			},
			{
				displayName: 'Enable Search Indexing',
				name: 'enableSearchIndexing',
				type: 'boolean',
				default: true,
				description: 'Whether the mailbox should be indexed so webmail search works',
			},
			{
				displayName: 'Recovery Email',
				name: 'recoveryEmail',
				type: 'string',
				placeholder: 'me@elsewhere.com',
				default: '',
				description: 'An address to add as a recovery method',
			},
			{
				displayName: 'Recovery Email Description',
				name: 'recoveryEmailDescription',
				type: 'string',
				default: '',
				description: 'A label for the recovery email, shown to the user',
			},
			{
				displayName: 'Recovery Phone',
				name: 'recoveryPhone',
				type: 'string',
				placeholder: '+233…',
				default: '',
				description: 'A phone number to add as a recovery method',
			},
			{
				displayName: 'Recovery Phone Description',
				name: 'recoveryPhoneDescription',
				type: 'string',
				default: '',
				description: 'A label for the recovery phone, shown to the user',
			},
			{
				displayName: 'Send Welcome Email',
				name: 'sendWelcomeEmail',
				type: 'boolean',
				default: true,
				description: 'Whether Purelymail should email the new user a welcome message',
			},
		],
	},

	// ---- User: get / modify / delete / app passwords
	{
		displayName: 'Address',
		name: 'userNameFull',
		type: 'string',
		default: '',
		required: true,
		placeholder: 'sales@example.com',
		description: 'The full email address of the mailbox',
		displayOptions: {
			show: {
				resource: ['user'],
				operation: ['get', 'modify', 'delete', 'deleteAppPassword'],
			},
		},
	},
	{
		displayName: 'App Password Address',
		name: 'userHandle',
		type: 'string',
		default: '',
		required: true,
		placeholder: 'sales@example.com',
		description:
			'The full email address of the mailbox the app password belongs to. Purelymail derives the password, so it is returned rather than chosen.',
		displayOptions: { show: { resource: ['user'], operation: ['createAppPassword'] } },
	},
	{
		displayName: 'Label',
		name: 'label',
		type: 'string',
		default: '',
		description:
			'A description to recognise this app password by later, such as n8n or Outlook. It is a label, not a secret, so it stays readable.',
		displayOptions: { show: { resource: ['user'], operation: ['createAppPassword'] } },
	},
	{
		displayName: 'App Password',
		name: 'appPassword',
		type: 'string',
		typeOptions: { password: true },
		default: '',
		required: true,
		description: 'The app password to delete',
		displayOptions: { show: { resource: ['user'], operation: ['deleteAppPassword'] } },
	},
	{
		displayName: 'Changes',
		name: 'modifyOptions',
		type: 'collection',
		placeholder: 'Add Change',
		default: {},
		description:
			'The changes to apply: rename the mailbox, set a new password, or change one of its settings. Anything left unchanged is not sent.',
		displayOptions: { show: { resource: ['user'], operation: ['modify'] } },
		options: [
			{
				displayName: 'New Address',
				name: 'newUserName',
				type: 'string',
				placeholder: 'newsales@example.com',
				default: '',
				description: 'A new full address to rename this mailbox to',
			},
			{
				displayName: 'New Password',
				name: 'newPassword',
				type: 'string',
				typeOptions: { password: true },
				default: '',
				description: 'A new password for this mailbox',
			},
			triState(
				'Password Reset',
				'enablePasswordReset',
				'Whether this user may reset their own password',
			),
			triState(
				'Search Indexing',
				'enableSearchIndexing',
				'Whether this mailbox is indexed for webmail search',
			),
			triState(
				'Require Two Factor Authentication',
				'requireTwoFactorAuthentication',
				'Whether this user must use two factor authentication to sign in',
			),
		],
	},

	// ---- Domain
	{
		displayName: 'Domain',
		name: 'domainName',
		type: 'string',
		default: '',
		required: true,
		placeholder: 'example.com',
		description: 'The domain to add',
		displayOptions: { show: { resource: ['domain'], operation: ['add'] } },
	},
	{
		displayName: 'Domain',
		name: 'domainNameNamed',
		type: 'string',
		default: '',
		required: true,
		placeholder: 'example.com',
		description:
			'The domain to work on. Purelymail names this field differently across endpoints, so the node sends the right one for you.',
		displayOptions: { show: { resource: ['domain'], operation: ['delete', 'updateSettings'] } },
	},
	{
		displayName: 'Include Shared Domains',
		name: 'includeShared',
		type: 'boolean',
		default: false,
		description: 'Whether to include the basic domains Purelymail shares with every account',
		displayOptions: { show: { resource: ['domain'], operation: ['list'] } },
	},
	{
		displayName: 'Settings',
		name: 'domainSettings',
		type: 'collection',
		placeholder: 'Add Setting',
		default: {},
		description:
			'The settings to change: account reset, symbolic subaddressing and a DNS recheck. Anything left unchanged is not sent.',
		displayOptions: { show: { resource: ['domain'], operation: ['updateSettings'] } },
		options: [
			triState(
				'Allow Account Reset',
				'allowAccountReset',
				'Whether this domain may be used to reset an account password',
			),
			{
				displayName: 'Recheck DNS',
				name: 'recheckDns',
				type: 'boolean',
				default: false,
				description: 'Whether to ask Purelymail to check the DNS records again now',
			},
			triState(
				'Symbolic Subaddressing',
				'symbolicSubaddressing',
				'Whether addresses like user_tag@ may be treated as user@',
			),
		],
	},

	// ---- Routing
	{
		displayName: 'Domain',
		name: 'domainName',
		type: 'string',
		default: '',
		required: true,
		placeholder: 'example.com',
		description: 'The domain this rule applies to',
		displayOptions: { show: { resource: ['routing'], operation: ['create'] } },
	},
	{
		displayName: 'Match Type',
		name: 'matchType',
		type: 'options',
		required: true,
		options: [
			{
				name: 'Exact Address',
				value: 'exact',
				description: 'Match one address exactly, such as sales@example.com',
			},
			{
				name: 'Any Address Starting With',
				value: 'prefix',
				description: 'Match every address beginning with the text given below, such as info',
			},
			{
				name: 'Catch-All',
				value: 'catchall',
				description:
					'Match every address on the domain that is not a mailbox. Purelymail calls this a catch-all.',
			},
		],
		default: 'exact',
		description: 'How mail should be matched before it is forwarded',
		displayOptions: { show: { resource: ['routing'], operation: ['create'] } },
	},
	{
		displayName: 'Match Address or Prefix',
		name: 'matchUser',
		type: 'string',
		default: '',
		placeholder: 'sales',
		description:
			'The part before the @ sign to match, so sales for sales@example.com. With a prefix match this is just the beginning of the address. Not used by a catch-all.',
		displayOptions: {
			show: { resource: ['routing'], operation: ['create'], matchType: ['exact', 'prefix'] },
		},
	},
	addressesField,
	{
		displayName: 'Routing Rule ID',
		name: 'routingRuleId',
		type: 'number',
		default: 0,
		required: true,
		description: 'The numeric ID of the rule, which the List operation returns',
		displayOptions: { show: { resource: ['routing'], operation: ['delete'] } },
	},

	// ---- Password reset
	{
		displayName: 'Address',
		name: 'userNameFull',
		type: 'string',
		default: '',
		required: true,
		placeholder: 'sales@example.com',
		description: 'The full email address of the mailbox',
		displayOptions: { show: { resource: ['passwordReset'], operation: ['upsert', 'list', 'delete'] } },
	},
	{
		displayName: 'Method Type',
		name: 'resetType',
		type: 'options',
		required: true,
		options: [
			{ name: 'Email', value: 'email', description: 'Recover using an email address' },
			{ name: 'Phone', value: 'phone', description: 'Recover using a phone number' },
		],
		default: 'email',
		description: 'The kind of recovery method to add or update',
		displayOptions: { show: { resource: ['passwordReset'], operation: ['upsert'] } },
	},
	{
		displayName: 'Target',
		name: 'resetTarget',
		type: 'string',
		default: '',
		required: true,
		placeholder: 'me@elsewhere.com',
		description: 'The email address or phone number for this recovery method',
		displayOptions: { show: { resource: ['passwordReset'], operation: ['upsert', 'delete'] } },
	},
	{
		displayName: 'Additional Fields',
		name: 'resetOptions',
		type: 'collection',
		placeholder: 'Add Field',
		default: {},
		description:
			'Optional settings for this recovery method: whether it may reset two factor authentication, a label, and the existing target when updating one',
		displayOptions: { show: { resource: ['passwordReset'], operation: ['upsert'] } },
		options: [
			{
				displayName: 'Allow MFA Reset',
				name: 'allowMfaReset',
				type: 'boolean',
				default: true,
				description:
					'Whether this recovery method may also be used to reset two factor authentication, not just the password',
			},
			{
				displayName: 'Description',
				name: 'description',
				type: 'string',
				default: '',
				description: 'A label for this method, shown to the user',
			},
			{
				displayName: 'Existing Target',
				name: 'existingTarget',
				type: 'string',
				default: '',
				description:
					'The target of the method to update, when changing one that already exists rather than adding a new one',
			},
		],
	},
];

export class Purelymail implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Purelymail',
		name: 'purelymail',
		icon: { light: 'file:purelymail.svg', dark: 'file:purelymail.dark.svg' },
		group: ['transform'],
		version: [1],
		subtitle: '={{$parameter["resource"] + ": " + $parameter["operation"]}}',
		description: 'Manage Purelymail mailboxes, domains, routing rules, app passwords and credit',
		defaults: { name: 'Purelymail' },
		usableAsTool: true,
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		credentials: [{ name: 'purelymailApi', required: true }],
		properties: [resourceOptions, ...operationOptions, ...fields],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];

		for (let i = 0; i < items.length; i++) {
			try {
				const resource = this.getNodeParameter('resource', i) as string;
				const operation = this.getNodeParameter('operation', i) as string;

				let endpoint: string;
				let body: IDataObject = {};
				let primitiveKey = 'value';

				if (resource === 'user') {
					if (operation === 'create') {
						endpoint = 'createUser';
						const options = this.getNodeParameter('createOptions', i, {}) as IDataObject;
						body = {
							userName: this.getNodeParameter('userName', i) as string,
							domainName: this.getNodeParameter('domainName', i) as string,
							password: this.getNodeParameter('password', i) as string,
							...options,
						};
					} else if (operation === 'get') {
						endpoint = 'getUser';
						body = { userName: this.getNodeParameter('userNameFull', i) as string };
					} else if (operation === 'list') {
						endpoint = 'listUser';
						primitiveKey = 'userName';
					} else if (operation === 'modify') {
						endpoint = 'modifyUser';
						const changes = this.getNodeParameter('modifyOptions', i, {}) as IDataObject;
						const cleaned: IDataObject = {};
						for (const [key, value] of Object.entries(changes)) {
							if (value === '') continue;
							cleaned[key] = value === 'true' ? true : value === 'false' ? false : value;
						}
						body = {
							userName: this.getNodeParameter('userNameFull', i) as string,
							...cleaned,
						};
					} else if (operation === 'delete') {
						endpoint = 'deleteUser';
						body = { userName: this.getNodeParameter('userNameFull', i) as string };
					} else if (operation === 'createAppPassword') {
						endpoint = 'createAppPassword';
						body = {
							userHandle: this.getNodeParameter('userHandle', i) as string,
							name: (this.getNodeParameter('label', i, '') as string) || '',
						};
					} else {
						endpoint = 'deleteAppPassword';
						body = {
							userName: this.getNodeParameter('userNameFull', i) as string,
							appPassword: this.getNodeParameter('appPassword', i) as string,
						};
					}
				} else if (resource === 'domain') {
					if (operation === 'add') {
						endpoint = 'addDomain';
						body = { domainName: this.getNodeParameter('domainName', i) as string };
					} else if (operation === 'list') {
						endpoint = 'listDomains';
						body = { includeShared: this.getNodeParameter('includeShared', i, false) as boolean };
					} else if (operation === 'ownershipCode') {
						endpoint = 'getOwnershipCode';
					} else if (operation === 'updateSettings') {
						endpoint = 'updateDomainSettings';
						const settings = this.getNodeParameter('domainSettings', i, {}) as IDataObject;
						const cleaned: IDataObject = {};
						for (const [key, value] of Object.entries(settings)) {
							if (value === '') continue;
							cleaned[key] = value === 'true' ? true : value === 'false' ? false : value;
						}
						body = {
							name: this.getNodeParameter('domainNameNamed', i) as string,
							...cleaned,
						};
					} else {
						endpoint = 'deleteDomain';
						// Purelymail takes `name` here and `domainName` on add, which their spec confirms.
						body = { name: this.getNodeParameter('domainNameNamed', i) as string };
					}
				} else if (resource === 'routing') {
					if (operation === 'create') {
						endpoint = 'createRoutingRule';
						body = buildRoutingRuleBody({
							domainName: this.getNodeParameter('domainName', i) as string,
							matchType: this.getNodeParameter('matchType', i) as RoutingMatchType,
							matchUser: this.getNodeParameter('matchUser', i, '') as string,
							targetAddresses: parseAddressList(this.getNodeParameter('targetAddresses', i) as string),
						});
					} else if (operation === 'list') {
						endpoint = 'listRoutingRules';
					} else {
						endpoint = 'deleteRoutingRule';
						body = { routingRuleId: this.getNodeParameter('routingRuleId', i) as number };
					}
				} else if (resource === 'passwordReset') {
					if (operation === 'list') {
						endpoint = 'listPasswordReset';
						body = { userName: this.getNodeParameter('userNameFull', i) as string };
					} else if (operation === 'delete') {
						endpoint = 'deletePasswordReset';
						const target = (this.getNodeParameter('resetTarget', i, '') as string) || undefined;
						body = {
							userName: this.getNodeParameter('userNameFull', i) as string,
							...(target === undefined ? {} : { target }),
						};
					} else {
						endpoint = 'upsertPasswordReset';
						const options = this.getNodeParameter('resetOptions', i, {}) as IDataObject;
						body = {
							userName: this.getNodeParameter('userNameFull', i) as string,
							type: this.getNodeParameter('resetType', i) as string,
							target: this.getNodeParameter('resetTarget', i) as string,
							...options,
						};
					}
				} else {
					endpoint = 'checkAccountCredit';
					primitiveKey = 'credit';
				}

				const result = await purelymailRequest(this, endpoint, body);

				for (const item of toItems(result, primitiveKey)) {
					returnData.push({ json: item, pairedItem: { item: i } });
				}
			} catch (error) {
				if (this.continueOnFail()) {
					returnData.push({
						json: { error: (error as Error).message },
						pairedItem: { item: i },
					});
					continue;
				}
				throw new NodeOperationError(this.getNode(), error as Error, { itemIndex: i });
			}
		}

		return [returnData];
	}
}
