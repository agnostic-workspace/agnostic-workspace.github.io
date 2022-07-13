


/* LAYER BETWEEN FASTOR AND CONSNET WITH PATTERN MATCHING */

function FastorConsnet() {

	this.fs = new Fastor();
	this.queryCollections = new Set();
}



FastorConsnet.prototype.erase = function() {

	this.fs = new Fastor();
}



FastorConsnet.prototype.add = function(input, domain) {

	let source = x(input);
	for (let line of source)
		this.fs.add(line.cons, line.car, line.cdr, domain);
}



FastorConsnet.prototype.gather = function(line) {

	let constants = {},
		variables = {};
	if (isVar(line.car)) variables.car = line.car; else constants.car = line.car;
	if (isVar(line.cdr)) variables.cdr = line.cdr; else constants.cdr = line.cdr;
	if (isVar(line.cons)) variables.cons = line.cons; else constants.cons = line.cons;

	return { constants, variables };
}



FastorConsnet.prototype.query = function(input, callback, prebindings) {

	let source = q(input);

	this.queryCollections = new Set();

	let bindings = this.queryPath(input, source, 0, [], callback, prebindings);
	let collection = Array.from(this.queryCollections);

	return { bindings, collection };
}



FastorConsnet.prototype.versions = function(extract, vars) {

	let byvar = {};
	let keys = Object.keys(vars);

	for (let key of keys) {
		byvar[vars[key]] = extract.map(e => e[key]);
	}

	let versions = [];
	for (let i = 0; i < extract.length; i++) {
		let version = {};
		for (let variable in byvar)
			version[variable] = byvar[variable][i];
		versions.push(version);
	}

	return versions;
}



FastorConsnet.prototype.bind = function(line, version) {

	return {
		car: version[line.car] || line.car,
		cdr: version[line.cdr] || line.cdr,
		cons: version[line.cons] || line.cons,
	}
}



FastorConsnet.prototype.queryPath = function(originalQuery, source, iter, collections, callback, bindings = [{}]) {

	if (iter == source.length) { // we made it to the end of the query
		if (callback)
			bindings.forEach(
				binding => callback.call(this, binding, collections, originalQuery)
			);
		return bindings;
	}

	let result = [];

	for (let binding of bindings) {

		let gathered = this.gather( this.bind(source[iter], binding) );
	
		let collection = this.fs.qry(gathered.constants);

		for (let triple of collection)
			this.queryCollections.add(this.fs.conscarcdr[triple.cons+'|'+triple.car+'|'+triple.cdr]);

		let newCollections = collections.concat([collection]);
				
		let versions = FastorConsnet.prototype.versions(collection, gathered.variables);
		
		let newBindings = versions.map(v => Object.assign({}, binding, v));

		result = result.concat(
			this.queryPath(originalQuery, source, iter+1, newCollections, callback, newBindings)
		);
	}

	return result;
}


