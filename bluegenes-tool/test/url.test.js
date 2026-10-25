const assert = require('node:assert/strict');
const { test } = require('node:test');

const { assemblyName, locString, buildJBrowse2Url } = require('../src/url');

const base = {
	jbrowse2Url: 'https://jbrowse2.intermine.org/',
	projectTitle: 'Humanmine',
	taxonId: 9606,
	ref: '11',
	start: 31789026,
	end: 31817961
};

test('assembly name is the lower-cased dataset id', () => {
	assert.equal(assemblyName('Humanmine', 9606), 'humanmine-9606');
	assert.equal(assemblyName('FlyMine', '7227'), 'flymine-7227');
});

test('assembly name agrees with the config generator', async () => {
	const { assemblyName: generated } = await import('../../config/lib.mjs');
	assert.equal(assemblyName('Humanmine', 9606), generated('https://x/humanmine', '9606', 'Humanmine-9606'));
	assert.equal(assemblyName('FlyMine', 7227), generated('https://x/flymine', '7227', 'FlyMine-7227'));
});

test('location strings are 1-based ref:start..end, optionally flanked', () => {
	assert.equal(locString('11', 100, 199), '11:100..199');
	assert.equal(locString('11', 100, 199, 0.1), '11:90..209');
	assert.equal(locString('X', 5, 104, 0.5), 'X:1..154'); // clamped at 1
});

test('builds the documented JBrowse 2 URL', () => {
	assert.equal(
		buildJBrowse2Url(base),
		'https://jbrowse2.intermine.org/?assembly=humanmine-9606&loc=11%3A31789026..31817961&tracks=humanmine-9606-Gene'
	);
});

test('opens several tracks and applies the flank', () => {
	const url = new URL(
		buildJBrowse2Url({ ...base, tracks: ['Gene', 'Transcript'], flank: 0.1 })
	);
	assert.equal(url.searchParams.get('tracks'), 'humanmine-9606-Gene,humanmine-9606-Transcript');
	assert.equal(url.searchParams.get('loc'), '11:31786132..31820855');
	assert.equal(url.searchParams.get('assembly'), 'humanmine-9606');
});

test('config param only when a config url is given, and it is encoded', () => {
	assert.equal(new URL(buildJBrowse2Url(base)).searchParams.has('config'), false);
	const url = buildJBrowse2Url({ ...base, configUrl: 'https://example.org/c.json?a=b&c=d' });
	assert.ok(url.includes('config=https%3A%2F%2Fexample.org%2Fc.json%3Fa%3Db%26c%3Dd&assembly='));
	assert.equal(new URL(url).searchParams.get('config'), 'https://example.org/c.json?a=b&c=d');
});

test('works with sub-path hosts and urls that already have a query', () => {
	assert.ok(
		buildJBrowse2Url({ ...base, jbrowse2Url: 'https://www.humanmine.org/jbrowse2/' }).startsWith(
			'https://www.humanmine.org/jbrowse2/?assembly='
		)
	);
	assert.ok(
		buildJBrowse2Url({ ...base, jbrowse2Url: 'https://h/?session=x' }).startsWith(
			'https://h/?session=x&assembly='
		)
	);
});

test('an empty track list falls back to Gene', () => {
	assert.equal(new URL(buildJBrowse2Url({ ...base, tracks: [] })).searchParams.get('tracks'), 'humanmine-9606-Gene');
});
