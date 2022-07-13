


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

    this.fcn.query.call(this.fcn, input, function(binding, collections, originalQuery) {
        for (let collection of collections) {
            try {
                collection.delete();
            } catch(e) {}
        }
    });
}



Consnet.prototype.query = function(input, callback, bindings) {

    return this.fcn.query.call(this.fcn, input, callback, bindings).bindings;
}



Consnet.prototype.collect = function(input, callback, bindings) {

    return this.fcn.query.call(this.fcn, input, callback, bindings).collection.map(id => this.fcn.fs.db.all[id]);
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



