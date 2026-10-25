// Builds the URL of a JBrowse 2 page showing one gene. Pure, so it can be tested
// without BlueGenes or a browser.

/**
 * Assembly names in the generated JBrowse 2 configs (config/generate.mjs) are the
 * server's dataset id, "<project title>-<taxon id>", lower-cased.
 */
function assemblyName(projectTitle, taxonId) {
	return `${projectTitle}-${taxonId}`.toLowerCase();
}

/**
 * start/end are InterMine chromosome locations (1-based, inclusive), which is also
 * what JBrowse 2 location strings use. `flank` widens the view on both sides by
 * that fraction of the gene's length.
 */
function locString(ref, start, end, flank = 0) {
	const pad = Math.round((end - start + 1) * flank);
	const from = Math.max(1, start - pad);
	return `${ref}:${from}..${end + pad}`;
}

/**
 * @param {object} p
 * @param {string} p.jbrowse2Url    root of the JBrowse 2 site, e.g. https://jbrowse2.intermine.org/
 * @param {string} [p.configUrl]    config to load; omit to use the site's own config.json
 * @param {string} p.projectTitle   web-properties project.title, e.g. "Humanmine"
 * @param {string|number} p.taxonId
 * @param {string} p.ref            chromosome name as InterMine knows it
 * @param {number} p.start
 * @param {number} p.end
 * @param {string[]} [p.tracks]     InterMine classes to open, e.g. ["Gene", "Transcript"]
 * @param {number} [p.flank]
 */
function buildJBrowse2Url(p) {
	const assembly = assemblyName(p.projectTitle, p.taxonId);
	const tracks = (p.tracks && p.tracks.length ? p.tracks : ['Gene']).map(
		cls => `${assembly}-${cls}`
	);
	const params = [];
	if (p.configUrl) params.push(`config=${encodeURIComponent(p.configUrl)}`);
	params.push(
		`assembly=${encodeURIComponent(assembly)}`,
		`loc=${encodeURIComponent(locString(p.ref, p.start, p.end, p.flank))}`,
		`tracks=${tracks.map(encodeURIComponent).join(',')}`
	);
	const base = p.jbrowse2Url.includes('?') ? p.jbrowse2Url : `${p.jbrowse2Url}?`;
	return `${base}${base.endsWith('?') || base.endsWith('&') ? '' : '&'}${params.join('&')}`;
}

module.exports = { assemblyName, locString, buildJBrowse2Url };
