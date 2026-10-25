const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

const { main } = require('../src');

const config = JSON.parse(readFileSync(join(__dirname, '..', 'config.json'), 'utf8'));

function fakeDom() {
	const doc = {
		createElement: tag => ({ tag }),
		createTextNode: text => ({ text })
	};
	const el = { children: [], appendChild(c) { this.children.push(c); } };
	return { doc, el };
}

const gene = {
	chromosomeLocation: { start: 31789026, end: 31817961, locatedOn: { primaryIdentifier: '11' } },
	organism: { taxonId: 9606 }
};
const entity = { Gene: { value: 5080 } };
const service = { root: 'https://www.humanmine.org/humanmine' };
const webProps = async url => {
	assert.equal(url, `${service.root}/service/web-properties`);
	return { json: async () => ({ 'web-properties': { project: { title: 'Humanmine' } } }) };
};

test('rejects calls with the wrong signature', () => {
	assert.throws(() => main('', 0, null, undefined, []), /Call main with correct signature/);
});

test('embeds an iframe pointing at JBrowse 2 for the gene', async () => {
	const { doc, el } = fakeDom();
	await main(el, service, entity, {}, config, {
		document: doc,
		fetch: webProps,
		queryData: async (id, root) => {
			assert.equal(id, 5080);
			assert.equal(root, service.root);
			return gene;
		}
	});
	assert.equal(el.children.length, 1);
	const [iframe] = el.children;
	assert.equal(iframe.tag, 'iframe');
	assert.equal(iframe.width, '100%');
	const url = new URL(iframe.src);
	assert.equal(url.origin, 'https://jbrowse2.intermine.org');
	assert.equal(url.searchParams.get('assembly'), 'humanmine-9606');
	assert.equal(url.searchParams.get('tracks'), 'humanmine-9606-Gene');
	assert.equal(url.searchParams.get('loc'), '11:31786132..31820855');
	assert.equal(url.searchParams.has('config'), false);
});

test('uses a custom JBrowse 2 site and config from the tool config', async () => {
	const { doc, el } = fakeDom();
	await main(
		el, service, entity, {},
		{ ...config, jbrowse2Url: 'https://www.humanmine.org/jbrowse2/', jbrowse2ConfigUrl: 'https://x/c.json', tracks: ['Gene'], flank: 0 },
		{ document: doc, fetch: webProps, queryData: async () => gene }
	);
	const url = new URL(el.children[0].src);
	assert.equal(url.pathname, '/jbrowse2/');
	assert.equal(url.searchParams.get('config'), 'https://x/c.json');
	assert.equal(url.searchParams.get('loc'), '11:31789026..31817961');
});

test('says so when the object has no gene location', async () => {
	const { doc, el } = fakeDom();
	await main(el, service, entity, {}, config, {
		document: doc, fetch: webProps, queryData: async () => { throw 'No gene data'; }
	});
	assert.equal(el.children[0].text, 'Not available for this object');
});

test('says so when web properties cannot be read', async () => {
	const { doc, el } = fakeDom();
	await main(el, service, entity, {}, config, {
		document: doc, fetch: async () => { throw new Error('offline'); }, queryData: async () => gene
	});
	assert.equal(el.children[0].text, 'Failed to start JBrowse');
});

test('tool config.json carries the keys BlueGenes needs', () => {
	assert.deepEqual(config.accepts, ['id']);
	assert.deepEqual(config.classes, ['Gene']);
	assert.equal(config.toolName.cljs, 'bluegenesJBrowse2Tool');
	assert.equal(config.jbrowse2Url, 'https://jbrowse2.intermine.org/');
	assert.ok(config.columnMapping.Gene.id);
	assert.deepEqual(config.files, { css: 'dist/style.css', js: 'dist/bundle.js' });
});

test('the built bundle exposes bluegenesJBrowse2Tool.main (as BlueGenes loads it)', () => {
	const code = readFileSync(join(__dirname, '..', config.files.js), 'utf8');
	const ctx = vm.createContext({});
	vm.runInContext(code, ctx);
	assert.equal(typeof vm.runInContext('bluegenesJBrowse2Tool.main', ctx), 'function');
	assert.equal(
		vm.runInContext(
			`(() => { try { bluegenesJBrowse2Tool.main('', 0, null, undefined, []) } catch (e) { return e.message } })()`,
			ctx
		),
		'Call main with correct signature'
	);
});

test('dist is up to date with src (run npm run build)', () => {
	const css = readFileSync(join(__dirname, '..', 'src', 'style.css'), 'utf8');
	assert.equal(readFileSync(join(__dirname, '..', config.files.css), 'utf8'), css);
});
