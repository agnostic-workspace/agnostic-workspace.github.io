 


function VectorSpace() {

    this.entries = [];
    this.angle = false;
    this.sorted = [];
}



VectorSpace.prototype.entry = function(vectorComponents, content) {

    this.entries.push({
        vector: new Vector(vectorComponents),
        content
    });

    if (this.angle) this.sort();
}



VectorSpace.prototype.sort = function(vectorComponents) {

    if (vectorComponents)
        this.angle = new Vector(vectorComponents);
    
    this.entries.sort((a, b) =>
        b.vector.getDistance(this.angle) - a.vector.getDistance(this.angle)
    );

    this.sorted = this.entries.map(entry => entry.content);
}
