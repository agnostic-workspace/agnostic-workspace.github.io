


function Storyteller(consnet) {

    this.cn = consnet;
    this.vs = new VectorSpace();
    this.told = [];
}



Storyteller.prototype.teller = function(query, angle, builder) {

    this.vs.entry(angle, { query, builder });
}



Storyteller.prototype.tell = function() {

    let that = this;
    let ignoredTriples = [];
    
    let story = '';
    this.vs.sorted.forEach(content =>
        this.cn.fcn.query(content.query, function(binding, collections, originalQuery) {            
            for (let collection of collections)
                for (let triple of collection) {
                    ignoredTriples.push(that.cn.fcn.fs.conscarcdr[strvb(triple.cons, triple.car, triple.cdr)]);
                }
            story += '\n'+ content.builder(binding, collections);
        }, null, that.told)
    );
    that.told = [...new Set(that.told.concat(ignoredTriples))];
    return story;
}



Storyteller.prototype.angle = function(vectorComponents) {

    this.vs.sort(vectorComponents);
}



