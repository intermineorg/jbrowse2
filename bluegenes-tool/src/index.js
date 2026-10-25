const queryData = require('./query');
const { buildJBrowse2Url } = require('./url');

// make sure to export main, with the signature
function main(el, service, imEntity, state, config, deps = {}) {
	if (!state) state = {};
	if (!el || !service || !imEntity || !state || !config) {
		throw new Error('Call main with correct signature');
	}
	const query = deps.queryData || queryData;
	const doFetch = deps.fetch || fetch;
	const doc = deps.document || document;

	return query(imEntity.Gene.value, service.root)
		.then(data => {
			const { end, start, locatedOn } = data.chromosomeLocation;
			const { taxonId } = data.organism;

			return doFetch(`${service.root}/service/web-properties`)
				.then(res => res.json())
				.then(obj => {
					const iframe = doc.createElement('iframe');
					iframe.src = buildJBrowse2Url({
						jbrowse2Url: config.jbrowse2Url,
						configUrl: config.jbrowse2ConfigUrl,
						projectTitle: obj['web-properties'].project.title,
						taxonId,
						ref: locatedOn.primaryIdentifier,
						start,
						end,
						tracks: config.tracks,
						flank: config.flank
					});
					iframe.width = '100%';
					iframe.height = '100%';
					iframe.frameBorder = 0;
					el.appendChild(iframe);
				})
				.catch(() => {
					el.appendChild(doc.createTextNode('Failed to start JBrowse'));
				});
		})
		.catch(() => {
			el.appendChild(doc.createTextNode('Not available for this object'));
		});
}

module.exports = { main };
