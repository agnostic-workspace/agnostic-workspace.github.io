


/* NETWORK OF CONS CELLS */

function Consnet(name) {

    this.fcn = new FastorConsnet(name);
    this.domain = false;
}



Consnet.prototype.erase = function() {

     this.fcn.erase();
}



Consnet.prototype.assert = function() {

    for (let source of Array.from(arguments))
        this.fcn.add.call(this.fcn, source, this.domain);
}



Consnet.prototype.retract = function(input) {

    let cells = [];
    this.fcn.query.call(this.fcn, input, function(binding, collections, originalQuery) {
        for (let collection of collections)
            for (let triple of collection) {
                this.fs.del(triple.cons, triple.car, triple.cdr);
                cells.push(triple.cons);
                cells.push(triple.car);
                cells.push(triple.cdr);
            }
    });
    return cells;
}



Consnet.prototype.query = function(input, bindings, callback) {

    return this.fcn.query.call(this.fcn, input, callback, bindings);
}



Consnet.prototype.match = function(input, bindings, callback) {

    return populate(
        this.fcn.query.call(this.fcn, input, callback, bindings),
        input
    );
}



Consnet.prototype.collect = function(input, bindings, callback) {

    return x(populate(
        this.fcn.query.call(this.fcn, input, callback, bindings),
        input
    ).join('\n'));
}



Consnet.prototype.group = function(query, group) {

    let collection = this.collect(query);

    for (let triple of collection) {
        this.fcn.fs.add(newId("group"), triple.cons, group);
        this.fcn.fs.add(newId("group"), triple.car, group);
        this.fcn.fs.add(newId("group"), triple.cdr, group);
    }
}



Consnet.prototype.qAssert = function(query, input) {

    this.target(query, this.assert, input);
}



Consnet.prototype.qRetract = function(query, input) {

    this.target(query, this.retract, input);
}



Consnet.prototype.target = function(query, action, input) {

    let that = this;
    this.fcn.query.call(this.fcn, query, function(binding, collections, originalQuery) {

        let sources = Array.isArray(input) ? input : [input];

        for (let source of sources)
            action.call(that, populate([binding], source));
    });

}



