const query = geneId => ({
	from: 'Gene',
	select: [
		'symbol',
		'chromosomeLocation.start',
		'chromosomeLocation.end',
		'chromosomeLocation.locatedOn.primaryIdentifier',
		'organism.taxonId'
	],
	where: [
		{
			path: 'id',
			value: geneId,
			op: '=',
			code: 'A'
		}
	]
});

// `imjs` is a global provided by BlueGenes.
// eslint-disable-next-line
function queryData(geneId, serviceUrl, imjsClient = imjs) {
	return new Promise((resolve, reject) => {
		const service = new imjsClient.Service({ root: serviceUrl });
		service
			.records(query(geneId))
			.then(data => {
				if (data.length) resolve(data[0]);
				else reject('No gene data with passed `geneId`!');
			})
			.catch(reject);
	});
}

module.exports = queryData;
